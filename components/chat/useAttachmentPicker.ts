"use client";

import { useCallback, useRef, useState } from "react";
import { readAttachment, rejectReason, type Attachment } from "@/lib/attachments";

/**
 * File-reading logic for the composer, separated from any particular button.
 *
 * The picker used to be one component that rendered both its trigger and the
 * attachment chips. Once the toolbar moved inside the input box those two
 * pieces needed to live in different places, so the behaviour lives here and
 * the composer decides where each part is drawn.
 */
export function useAttachmentPicker({
  attachments,
  onChange,
  maxCount,
  maxMb,
  allowImages,
  allowPdf,
  allowZip,
}: {
  attachments: Attachment[];
  onChange: (next: Attachment[]) => void;
  maxCount: number;
  maxMb: number;
  allowImages: boolean;
  allowPdf: boolean;
  allowZip: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accept = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setError(null);

      const room = maxCount - attachments.length;
      if (room <= 0) {
        setError(`You can attach up to ${maxCount} file${maxCount === 1 ? "" : "s"} at a time.`);
        return;
      }

      setBusy(true);
      setStatus(files.length === 1 ? `Reading ${files[0].name}…` : `Reading ${files.length} files…`);

      const added: Attachment[] = [];
      const problems: string[] = [];

      for (const file of Array.from(files).slice(0, room)) {
        const reason = rejectReason(file, maxMb, allowPdf, allowZip);
        if (reason) {
          problems.push(reason);
          continue;
        }
        if (!allowImages && file.type.startsWith("image/")) {
          problems.push("Images need a vision-capable model — pick one from the model list.");
          continue;
        }
        try {
          added.push(await readAttachment(file));
        } catch (err) {
          problems.push(err instanceof Error ? err.message : `Could not read ${file.name}.`);
        }
      }

      if (added.length) onChange([...attachments, ...added]);
      if (problems.length) setError(problems[0]);
      setBusy(false);
      setStatus(null);
      if (inputRef.current) inputRef.current.value = "";
    },
    [attachments, onChange, maxCount, maxMb, allowImages, allowPdf, allowZip],
  );

  const open = useCallback(() => inputRef.current?.click(), []);

  return { inputRef, accept, open, busy, status, error, setError };
}
