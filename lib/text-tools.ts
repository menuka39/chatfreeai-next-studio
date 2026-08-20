/**
 * Text-based AI tools (resume builder, screener, document forge, product
 * recommender, document Q&A).
 *
 * These all do the same thing mechanically: collect a few fields, build a
 * prompt, call a chat model, stream back text. So they share one API route
 * (/api/tool) and one UI component — a new tool is a config entry, not a new
 * codebase.
 *
 * BILLING: identical to chat. Credits = tokens × weight, where the weight is
 * recomputed from the live OpenRouter price at request time. No separate
 * package, no separate rate — a token spent here costs the user exactly what
 * it would cost in the chat box.
 *
 * `tier` decides which models are offered: "light" tools default to a cheap
 * model, "heavy" ones to a stronger model, but the user can always pick.
 */

export interface TextToolField {
  id: string;
  label: string;
  type: "text" | "textarea" | "select";
  placeholder?: string;
  options?: string[];
  required?: boolean;
  rows?: number;
  /** guards our own cost — long pastes are the expensive case */
  maxLength?: number;
  help?: string;
}

export interface TextToolConfig {
  slug: string;
  name: string;
  tagline: string;
  intro: string;
  fields: TextToolField[];
  /** model ids from lib/models.ts, cheapest first; [0] is the default */
  modelChoices: string[];
  maxOutputTokens: number;
  outputLabel: string;
  /** true when the output is a document the user will copy or download */
  downloadable?: boolean;
  build: (v: Record<string, string>) => { system: string; user: string };
}

const trim = (s: string | undefined, max = 8000) => (s ?? "").trim().slice(0, max);


/**
 * Appended to every text tool's system prompt.
 *
 * The output is rendered as Markdown, but a model only writes Markdown if
 * asked — otherwise a well-structured answer arrives as one undifferentiated
 * block and the renderer has nothing to work with. Deliberately brief: these
 * tools produce different shapes of answer, and dictating a layout would
 * fight the content.
 */
const MARKDOWN_RULES = [
  "",
  "FORMAT: reply in GitHub-flavoured Markdown — `##` headings, **bold** for key",
  "figures, bullet lists rather than comma-separated runs, and real | pipe | tables",
  "with a |---| row where you are comparing things. Blank line between blocks. Do",
  "not wrap the whole reply in a code fence.",
].join("\n");

const workTools: TextToolConfig[] = [
  /* ------------------------------------------------------------------ */
  {
    slug: "resume-screener",
    downloadable: true,
    name: "Resume Screener",
    tagline: "Shortlist against your criteria",
    intro:
      "Paste a job description and one or more resumes. You get a weighted 100-point score you can " +
      "break down, the evidence behind every point, the gaps, an ATS readiness check, and interview " +
      "questions aimed at each candidate's weak spots.",
    modelChoices: ["deepseek", "claude-sonnet-46", "gpt-54"],
    // raised from 3000: the report now carries sub-scores, three skill lists,
    // red flags, ATS notes and interview questions for EACH candidate, and
    // multi-candidate runs were being cut off mid-report
    maxOutputTokens: 6000,
    outputLabel: "Screening report",
    fields: [
      {
        id: "jd",
        label: "Job description",
        type: "textarea",
        rows: 6,
        required: true,
        maxLength: 6000,
        placeholder: "Paste the full job description, including must-have requirements.",
      },
      {
        id: "resumes",
        label: "Resume(s)",
        type: "textarea",
        rows: 10,
        required: true,
        maxLength: 20000,
        placeholder: "Paste one or more resumes. Separate candidates with a line containing ---",
        help: "Separate multiple candidates with a line containing only ---",
      },
      { id: "focus", label: "Weight most heavily", type: "select", options: ["Balanced", "Technical skills", "Years of experience", "Domain knowledge", "Leadership"] },
    ],
    build: (v) => ({
      /**
       * A weighted 100-point rubric rather than a loose "score out of 10".
       *
       * A single number nobody can decompose is not defensible — and a
       * screening decision has to be. Fixed weights mean two recruiters
       * scoring the same pair get the same answer, and a candidate who asks
       * why they were declined can be shown which band they lost points in.
       *
       * Rendered as a readable report, not raw JSON: this streams into a
       * page a person reads. The structure below is the JSON schema's
       * fields in the order a recruiter actually needs them — verdict first,
       * then the evidence for it.
       */
      system: [
        "You are an expert talent acquisition specialist and technical recruiter, fluent in how",
        "applicant tracking systems parse resumes. Evaluate ONE OR MORE candidate resumes against",
        "the job description objectively and without bias.",
        "",
        "SCORING — 100 points, fixed weights. Show the sub-scores, never just the total:",
        "  • Hard/technical skills match — 40 pts. Separate exact matches from synonym matches",
        "    (e.g. 'Postgres' = 'PostgreSQL') and from genuinely missing skills.",
        "  • Experience & seniority — 30 pts. Relevant years, industry alignment, career progression.",
        "  • Education & certifications — 15 pts. Against the stated minimum, not an ideal.",
        "  • Impact & soft skills — 15 pts. Leadership, communication, and quantified results",
        "    ('cut load time 40%'), not adjectives.",
        "",
        "VERDICT: Highly Recommended (80+) / Potential Fit (50-79) / Not Recommended (<50).",
        "If the resume is unrelated to the role, score below 20 and say so plainly.",
        "",
        "ALSO REPORT, for each candidate:",
        "  • Skills matched, must-have skills missing, nice-to-have skills missing — as lists.",
        "  • Red flags: unexplained gaps, runs of roles under 6 months, no quantified outcomes.",
        "    State the observation, not a judgement of the person.",
        "  • ATS parsing readiness out of 10, and which required keywords the resume never uses.",
        "  • 3-5 interview questions targeting THIS candidate's specific weak areas — questions",
        "    that would settle the doubt, not generic ones.",
        "  • A three-sentence executive summary justifying the score.",
        "",
        "RULES:",
        "  • Judge only what the resume states. Never infer age, gender, nationality, ethnicity or",
        "    any protected characteristic, and never let a name influence a score.",
        "  • If a requirement cannot be assessed from the resume, say 'not stated' — do not guess",
        "    and do not penalise as if it were absent.",
        "  • Quote or closely paraphrase the resume for every claim you make about it.",
        "  • End with a ranked table across all candidates: name, total score, verdict.",
        "",
        "FORMAT — write GitHub-flavoured Markdown, not plain prose:",
        "  • `## Candidate Name` for each candidate, `###` for the sections beneath.",
        "  • **Bold** every score and verdict so they can be found at a glance.",
        "  • Bullet lists for skills, red flags and questions — never comma-separated runs.",
        "  • A real Markdown table for the score breakdown and for the final ranking,",
        "    using | pipes | and a |---| separator row.",
        "  • A blank line between blocks. Do not wrap the whole reply in a code fence.",
      ].join("\n"),
      user: [
        `Weight most heavily: ${v.focus || "Balanced"}`,
        `(Apply this within the fixed weights — it breaks ties, it does not replace the rubric.)`,
        ``,
        `=== JOB DESCRIPTION ===`,
        trim(v.jd, 6000),
        ``,
        `=== CANDIDATES ===`,
        trim(v.resumes, 20000),
      ].join("\n"),
    }),
  },

  /* ------------------------------------------------------------------ */
  {
    slug: "document-forge",
    name: "AI Document Forge",
    tagline: "A brief in, a finished document out",
    intro:
      "Reports, proposals, letters, policies and SOPs — describe what you need and get a structured draft you can edit rather than a blank page.",
    modelChoices: ["deepseek", "gpt-54-mini", "claude-sonnet-46", "gpt-54"],
    maxOutputTokens: 4000,
    outputLabel: "Your document",
    downloadable: true,
    fields: [
      {
        id: "docType",
        label: "Document type",
        type: "select",
        required: true,
        options: ["Business report", "Project proposal", "Formal letter", "Company policy", "Standard operating procedure", "Meeting minutes", "Press release"],
      },
      { id: "title", label: "Title / subject", type: "text", required: true, maxLength: 200, placeholder: "Q3 warehouse automation proposal" },
      { id: "audience", label: "Audience", type: "text", maxLength: 160, placeholder: "Board of directors" },
      {
        id: "brief",
        label: "Brief",
        type: "textarea",
        rows: 8,
        required: true,
        maxLength: 6000,
        placeholder: "What must the document cover? Include key facts, figures, names and any conclusions you want reached.",
      },
      { id: "length", label: "Length", type: "select", options: ["Short (1 page)", "Standard (2-3 pages)", "Detailed (4+ pages)"] },
      { id: "tone", label: "Tone", type: "select", options: ["Professional", "Formal", "Friendly", "Technical", "Persuasive"] },
    ],
    build: (v) => ({
      system:
        "You are a professional business writer. Produce a complete, well-structured document in " +
        "Markdown with appropriate headings, and the sections a reader would expect for this document " +
        "type. Use only the facts and figures the user supplied — where something is missing that the " +
        "document format requires, insert a clearly marked placeholder like [DATE] or [FIGURE] rather " +
        "than inventing it. Output the document only, with no preamble.",
      user: [
        `Document type: ${v.docType}`,
        `Title: ${trim(v.title, 200)}`,
        v.audience ? `Audience: ${trim(v.audience, 160)}` : "",
        `Target length: ${v.length || "Standard (2-3 pages)"}`,
        `Tone: ${v.tone || "Professional"}`,
        ``,
        `Brief:`,
        trim(v.brief, 6000),
      ].join("\n"),
    }),
  },

  /* ------------------------------------------------------------------ */
  {
    slug: "product-recommender",
    downloadable: true,
    name: "Product Recommender",
    tagline: "Describe the need, get real options",
    intro:
      "Explain what you're trying to do and the constraints. You get categories and specific options to research, with the tradeoffs spelled out.",
    modelChoices: ["deepseek", "perplexity", "sonar-pro"],
    maxOutputTokens: 2000,
    outputLabel: "Recommendations",
    fields: [
      {
        id: "need",
        label: "What do you need?",
        type: "textarea",
        rows: 5,
        required: true,
        maxLength: 2000,
        placeholder: "A laptop for video editing that I can carry to client sites all day.",
      },
      { id: "budget", label: "Budget", type: "text", maxLength: 80, placeholder: "Under $1,500" },
      { id: "constraints", label: "Must-haves and deal-breakers", type: "textarea", rows: 3, maxLength: 1500, placeholder: "Must run Linux. No Apple. Needs 32GB RAM." },
      { id: "count", label: "How many options", type: "select", options: ["3", "5", "8"] },
    ],
    build: (v) => ({
      system:
        "You are a knowledgeable, impartial buying adviser. Recommend the requested number of options, " +
        "each with: what it is, why it fits this person's stated need, the main tradeoff, and roughly " +
        "what it costs. Rank them and say plainly which you would pick and why. Be honest about " +
        "weaknesses. If prices or model availability may have changed, say so and tell the user to " +
        "verify current pricing rather than stating a stale price as fact." + MARKDOWN_RULES,
      user: [
        `Need: ${trim(v.need, 2000)}`,
        v.budget ? `Budget: ${trim(v.budget, 80)}` : "Budget: not specified",
        v.constraints ? `Constraints: ${trim(v.constraints, 1500)}` : "",
        `Number of options: ${v.count || "5"}`,
      ].join("\n"),
    }),
  },

  /* ------------------------------------------------------------------ */
  {
    slug: "knowledge-bot",
    downloadable: true,
    name: "Document Q&A",
    tagline: "Ask questions about your own text",
    intro:
      "Paste a document and ask questions about it. Answers come only from what you pasted — if the text doesn't say, the tool tells you so instead of guessing.",
    modelChoices: ["deepseek", "gemini-3-flash", "claude-sonnet-46"],
    maxOutputTokens: 2000,
    outputLabel: "Answer",
    fields: [
      {
        id: "document",
        label: "Your document",
        type: "textarea",
        rows: 12,
        required: true,
        maxLength: 40000,
        placeholder: "Paste the policy, contract, manual, report or notes you want to ask about.",
        help: "Up to ~40,000 characters. Longer documents cost more credits.",
      },
      {
        id: "question",
        label: "Your question",
        type: "textarea",
        rows: 3,
        required: true,
        maxLength: 1000,
        placeholder: "What is the notice period for termination, and who has to be informed?",
      },
    ],
    build: (v) => ({
      system:
        "Answer strictly from the supplied document. Quote or cite the relevant part so the user can " +
        "verify it. If the document does not contain the answer, say exactly that — do not fill the " +
        "gap from general knowledge, and do not speculate. If the document is ambiguous on the point, " +
        "explain the ambiguity." + MARKDOWN_RULES,
      user: [`=== DOCUMENT ===`, trim(v.document, 40000), ``, `=== QUESTION ===`, trim(v.question, 1000)].join("\n"),
    }),
  },
];

/**
 * Prompt Studio — eight tools that write prompts rather than answers.
 *
 * Every one of these produces text the user copies into ANOTHER tool, so they
 * share two rules the rest of this file doesn't: the model must return the
 * prompt itself with no preamble, labels or quotation marks, and it must not
 * carry out the request. MARKDOWN_RULES is deliberately absent from most of
 * them — a prompt pasted into Midjourney or Veo should not arrive wearing
 * headings and bullet syntax. The checker is the exception, because its output
 * is a report a person reads here.
 *
 * The recipes are the ones from the WordPress Prompt Studio, kept intact:
 * they are tuned wording, not boilerplate.
 */
const PROMPT_ONLY = "\nOutput plain text only: the finished prompt, nothing else. No markdown, no headings, no labels like \"Prompt:\", no quotation marks around the result, and no commentary before or after.";

const PROMPT_MODELS = ["deepseek", "gemini-3-flash", "claude-sonnet-46"];

const IDEA_FIELD = (placeholder: string, label = "Your idea"): TextToolField => ({
  id: "idea",
  label,
  type: "textarea",
  rows: 4,
  required: true,
  maxLength: 3000,
  placeholder,
});

const promptTools: TextToolConfig[] = [
  {
    slug: "prompt-generator",
    name: "AI Prompt Generator",
    tagline: "Turn a rough idea into a usable prompt",
    intro:
      "Type your idea in plain language. You get back a structured prompt with a defined role, task, " +
      "constraints and output format — the parts that make a model give you the same quality of answer " +
      "every time instead of a different one each run.",
    modelChoices: PROMPT_MODELS,
    maxOutputTokens: 1200,
    outputLabel: "Your prompt",
    fields: [
      IDEA_FIELD("e.g. A weekly newsletter that summarizes AI news for small business owners"),
      { id: "purpose", label: "Purpose", type: "select", options: ["General", "Writing", "Coding", "Business", "Marketing", "Research", "Creative"] },
      { id: "tone", label: "Tone", type: "select", options: ["Professional", "Casual", "Creative", "Technical"] },
    ],
    build: (v) => ({
      system:
        "You are an expert prompt engineer. Turn the user's rough idea into a single, polished, ready-to-use AI prompt.\n" +
        `Context: the finished prompt will be used for a "${v.purpose || "General"}" task, written in a "${v.tone || "Professional"}" tone.\n` +
        "Rules:\n" +
        "- Make the prompt specific, structured and unambiguous (add role, context, task, constraints, and desired output format where useful).\n" +
        "- Do not answer the user's idea yourself, only produce the improved PROMPT." +
        PROMPT_ONLY,
      user: trim(v.idea, 3000),
    }),
  },

  {
    slug: "prompt-checker",
    name: "Prompt Checker",
    tagline: "Score and rewrite a prompt you already have",
    intro:
      "Paste a prompt and get it reviewed the way an experienced prompt engineer would: a score out of ten, " +
      "what already works, what is holding it back, and a stronger rewrite you can use straight away.",
    modelChoices: PROMPT_MODELS,
    maxOutputTokens: 2000,
    outputLabel: "Review",
    fields: [
      {
        id: "prompt",
        label: "The prompt to review",
        type: "textarea",
        rows: 8,
        required: true,
        maxLength: 3000,
        placeholder: "Paste the full prompt you want reviewed here…",
      },
    ],
    build: (v) => ({
      // the one tool here whose output is read rather than copied onward, so
      // it gets the shared Markdown treatment
      system:
        "You are a meticulous prompt-quality reviewer.\n" +
        "Analyse the prompt the user provides and return:\n" +
        "1. Score: X/10\n" +
        "2. Strengths: 2-4 short bullet points\n" +
        "3. Weaknesses: 2-4 short bullet points\n" +
        "4. Improved Version: a rewritten, stronger version of the prompt\n" +
        "Keep it concise and actionable. Put the improved version in a fenced code block so it can be copied cleanly." +
        MARKDOWN_RULES,
      user: trim(v.prompt, 3000),
    }),
  },

  {
    slug: "image-prompt-generator",
    name: "Image Prompt Generator",
    tagline: "Midjourney, DALL-E, Stable Diffusion, Flux",
    intro:
      "Describe what you want to see. You get one detailed image prompt covering subject, setting, " +
      "composition, lighting, palette and mood — with the right parameter flags appended when you pick Midjourney.",
    modelChoices: PROMPT_MODELS,
    maxOutputTokens: 1200,
    outputLabel: "Image prompt",
    fields: [
      IDEA_FIELD("e.g. An old fisherman mending nets at dawn on a Sri Lankan beach"),
      { id: "platform", label: "Platform", type: "select", options: ["General", "Midjourney", "DALL-E 3", "Stable Diffusion", "Flux"] },
      { id: "style", label: "Style", type: "select", options: ["Photorealistic", "Cinematic", "Anime", "Digital Art", "3D Render", "Fantasy", "Minimalist"] },
      { id: "ratio", label: "Aspect Ratio", type: "select", options: ["1:1", "16:9", "9:16", "4:3", "3:2"] },
    ],
    build: (v) => ({
      system:
        "You are an expert AI image-prompt engineer for tools such as Midjourney, DALL-E 3, Stable Diffusion and Flux.\n" +
        `Convert the user's idea into ONE detailed image-generation prompt for the "${v.platform || "General"}" platform, in a "${v.style || "Photorealistic"}" style, target aspect ratio ${v.ratio || "1:1"}.\n` +
        "Include: subject and action, setting, composition/camera angle, lighting, color palette, mood, and relevant quality modifiers.\n" +
        "If the platform is Midjourney, append correct parameter flags (e.g. --ar, --style, --v) at the end on the same line." +
        PROMPT_ONLY,
      user: trim(v.idea, 3000),
    }),
  },

  {
    slug: "video-prompt-generator",
    name: "Video Prompt Generator",
    tagline: "Text-to-video prompts for Veo and friends",
    intro:
      "Turn an idea into one detailed video prompt: scene, subject and action, camera movement and shot type, " +
      "lighting, colour grade, mood and pacing — sized to the duration you pick.",
    modelChoices: PROMPT_MODELS,
    maxOutputTokens: 1200,
    outputLabel: "Video prompt",
    fields: [
      IDEA_FIELD("e.g. A tuk-tuk weaving through Colombo traffic in the rain at night"),
      { id: "style", label: "Style / Mood", type: "select", options: ["Cinematic", "Documentary", "Commercial / Ad", "Anime", "Vlog-style", "Fantasy"] },
      { id: "camera", label: "Camera Movement", type: "select", options: ["Static", "Pan", "Tracking Shot", "Drone / Aerial", "Handheld", "Dolly Zoom"] },
      { id: "duration", label: "Duration", type: "select", options: ["4s", "8s", "15s"] },
      { id: "audio", label: "Dialogue / audio cue", type: "select", options: ["No dialogue", "Include dialogue"] },
    ],
    build: (v) => ({
      system:
        "You are an expert AI video-prompt engineer specializing in modern text-to-video models such as Veo, Kling and Sora.\n" +
        `Convert the user's idea into ONE detailed video prompt, "${v.style || "Cinematic"}" style, camera movement: "${v.camera || "Static"}", target duration ${v.duration || "8s"}. ` +
        (v.audio === "Include dialogue"
          ? "Include a short audio/dialogue cue.\n"
          : "No dialogue needed, describe ambient sound only if relevant.\n") +
        "Include: scene description, subject and action, camera movement and shot type, lighting, color grade, mood/atmosphere, and pacing." +
        PROMPT_ONLY,
      user: trim(v.idea, 3000),
    }),
  },

  {
    slug: "song-prompt-generator",
    name: "Song Prompt Generator",
    tagline: "Style tags and structure for Suno and Udio",
    intro:
      "Get a ready-to-use music prompt: a style-tag line with genre, mood, vocal, tempo feel and instrumentation, " +
      "then a song-structure outline and a one-line lyrical theme. It describes the theme rather than writing the lyrics.",
    modelChoices: PROMPT_MODELS,
    maxOutputTokens: 1200,
    outputLabel: "Song prompt",
    fields: [
      IDEA_FIELD("e.g. Missing home while working night shifts in a city far away"),
      { id: "genre", label: "Genre", type: "select", options: ["Pop", "Hip-Hop", "Rock", "Lo-fi", "EDM", "Country", "R&B", "Cinematic"] },
      { id: "mood", label: "Mood", type: "select", options: ["Upbeat", "Emotional", "Chill", "Energetic", "Dark", "Romantic"] },
      { id: "vocal", label: "Vocal Style", type: "select", options: ["Female vocal", "Male vocal", "Duet", "Instrumental only"] },
    ],
    build: (v) => ({
      system:
        "You are an expert AI music-prompt engineer for tools such as Suno and Udio.\n" +
        `Convert the user's idea into ONE ready-to-use music generation prompt: a short style-tag line (${v.genre || "Pop"} genre, ${v.mood || "Upbeat"} mood, ${v.vocal || "Female vocal"}, tempo/BPM feel, key instrumentation), followed by a brief song-structure outline (e.g. intro, verse, chorus, bridge, outro) and a one-sentence lyrical theme summary.\n` +
        "Do not write full lyrics or verses — describe the theme only, not the words themselves." +
        PROMPT_ONLY,
      user: trim(v.idea, 3000),
    }),
  },

  {
    slug: "story-prompt-generator",
    name: "Story Prompt Generator",
    tagline: "Openings that leave room to write",
    intro:
      "Turns an idea into an evocative writing prompt — a scene or situation with somewhere to go. " +
      "It sets up the story rather than telling it, so the writing is still yours.",
    modelChoices: PROMPT_MODELS,
    maxOutputTokens: 1000,
    outputLabel: "Story prompt",
    fields: [
      IDEA_FIELD("e.g. A lighthouse keeper who receives letters that haven't been written yet"),
      { id: "genre", label: "Genre", type: "select", options: ["Fantasy", "Sci-Fi", "Mystery", "Romance", "Horror", "Adventure", "Slice of Life", "Historical"] },
      { id: "length", label: "Length", type: "select", options: ["Short story", "Flash fiction", "Novel opening", "Writing exercise"] },
      { id: "perspective", label: "Perspective", type: "select", options: ["Any", "First person", "Third person"] },
    ],
    build: (v) => ({
      system:
        "You are an experienced creative writing teacher who designs inspiring story prompts.\n" +
        `Turn the user's idea into ONE evocative, open-ended writing prompt for a "${v.genre || "Fantasy"}" ${v.length || "Short story"}, written from a "${v.perspective || "Any"}" perspective where relevant.\n` +
        "The prompt should set a scene or situation and leave room for the writer's own imagination — do not write the story itself, only the prompt that inspires it.\n" +
        "Keep it to 2-4 sentences." +
        PROMPT_ONLY,
      user: trim(v.idea, 3000),
    }),
  },

  {
    slug: "character-prompt-generator",
    name: "Character Prompt Generator",
    tagline: "Personas for stories, games and chatbots",
    intro:
      "Builds a character profile from an idea: a suggested name, core traits, speech style, a background hook " +
      "and what drives them — shaped for the use you pick.",
    modelChoices: PROMPT_MODELS,
    maxOutputTokens: 1400,
    outputLabel: "Character profile",
    fields: [
      IDEA_FIELD("e.g. A retired train driver who now runs a tea shop and knows everyone's secrets"),
      { id: "purpose", label: "Purpose", type: "select", options: ["Creative writing character", "Roleplay chatbot", "Game NPC", "Virtual assistant persona"] },
      { id: "tone", label: "Personality Tone", type: "select", options: ["Friendly", "Mysterious", "Wise", "Quirky", "Serious", "Villainous"] },
    ],
    build: (v) => ({
      system:
        "You are an expert character and persona designer.\n" +
        `Turn the user's idea into ONE detailed character profile suited for a "${v.purpose || "Creative writing character"}", with a "${v.tone || "Friendly"}" personality tone. Include: a suggested name, core personality traits, speech style/voice, a short background hook, and motivations.\n` +
        // Kept verbatim from the source tool. Persona generators are a standing
        // route to sexualised output, and the instruction has to survive here
        // rather than being softened into a general "be appropriate".
        "Safety rules: keep the character strictly all-ages and non-sexual. Never include romantic, sexual, or suggestive content, and never depict or imply a minor in a romantic or sexual context. If the user's request pushes toward any of that, design a wholesome, all-ages-appropriate character instead without commenting on the refusal." +
        PROMPT_ONLY,
      user: trim(v.idea, 3000),
    }),
  },

  {
    slug: "logo-prompt-generator",
    name: "Logo Prompt Generator",
    tagline: "Brand marks for Midjourney and Ideogram",
    intro:
      "Turns a brand idea into a logo prompt with composition, line quality and negative-space direction, " +
      "finished with the modifiers that keep the result clean and scalable.",
    modelChoices: PROMPT_MODELS,
    maxOutputTokens: 1000,
    outputLabel: "Logo prompt",
    fields: [
      IDEA_FIELD("e.g. A sewing machine repair shop that has been in the family for three generations"),
      { id: "style", label: "Style", type: "select", options: ["Minimalist", "Modern / Geometric", "Vintage / Retro", "Hand-drawn", "Luxury", "Playful / Mascot"] },
      { id: "type", label: "Logo Type", type: "select", options: ["Icon / Symbol", "Wordmark", "Lettermark / Monogram", "Combination Mark", "Mascot"] },
      { id: "palette", label: "Color Palette", type: "select", options: ["Monochrome", "Bold Primary", "Pastel", "Earth Tones", "Vibrant"] },
    ],
    build: (v) => ({
      system:
        "You are an expert AI logo and brand-mark prompt engineer for tools such as Midjourney, DALL-E, and Ideogram.\n" +
        `Convert the user's brand idea into ONE detailed logo-generation prompt: "${v.style || "Minimalist"}" style, "${v.type || "Icon / Symbol"}" logo type, "${v.palette || "Monochrome"}" color palette. Include composition, line quality, negative space use, and finish with quality modifiers such as "vector style, clean lines, white background, scalable, high contrast".` +
        PROMPT_ONLY,
      user: trim(v.idea, 3000),
    }),
  },
];

export const textTools: TextToolConfig[] = [...workTools, ...promptTools];

export const textToolBySlug = (slug: string) => textTools.find((t) => t.slug === slug);

/**
 * The serialisable half of a tool config. `build` is a function, so it can't
 * cross the server/client boundary — and it shouldn't, since prompts are
 * assembled server-side where the user can't edit them.
 */
export type TextToolClient = Omit<TextToolConfig, "build">;

export function toClientTool(t: TextToolConfig): TextToolClient {
  const { build, ...rest } = t;
  void build; // server-only builder, deliberately not sent to the client
  return rest;
}
