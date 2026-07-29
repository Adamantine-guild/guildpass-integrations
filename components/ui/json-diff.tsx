import React, { useMemo } from 'react';
import * as Diff from 'diff';
import { cn } from '@/lib/utils';

interface JsonDiffProps {
  /** The old/current object (e.g., from the server) */
  oldObj: Record<string, unknown>;
  /** The new/attempted object (e.g., what the user tried to save) */
  newObj: Record<string, unknown>;
  /** Optional class name for the wrapper */
  className?: string;
}

/**
 * A component that renders a side-by-side or line-by-line diff of two JSON objects.
 * Useful for showing conflict resolution details.
 */
export function JsonDiff({ oldObj, newObj, className }: JsonDiffProps) {
  const diffResult = useMemo(() => {
    const oldStr = JSON.stringify(oldObj, null, 2) + '\n';
    const newStr = JSON.stringify(newObj, null, 2) + '\n';
    return Diff.diffLines(oldStr, newStr);
  }, [oldObj, newObj]);

  return (
    <div
      className={cn(
        "rounded-md border bg-muted/30 p-4 font-mono text-xs sm:text-sm overflow-x-auto",
        className
      )}
    >
      <pre className="whitespace-pre-wrap break-all m-0">
        {diffResult.map((part, index) => {
          let bgClass = "bg-transparent";
          let textClass = "text-foreground";
          let prefix = "  ";

          if (part.added) {
            bgClass = "bg-green-500/20";
            textClass = "text-green-700 dark:text-green-400";
            prefix = "+ ";
          } else if (part.removed) {
            bgClass = "bg-red-500/20";
            textClass = "text-red-700 dark:text-red-400";
            prefix = "- ";
          } else {
            textClass = "text-muted-foreground";
          }

          // Split the value by lines so we can prepend the prefix (+, -, or space) to each line,
          // except for the last empty line which is a trailing artifact of diffLines.
          const lines = part.value.split('\n');
          if (lines[lines.length - 1] === '') {
            lines.pop();
          }

          return (
            <div key={index} className={cn("block w-full rounded-sm", bgClass, textClass)}>
              {lines.map((line, i) => (
                <div key={i} className="flex">
                  <span className="select-none inline-block w-6 text-center opacity-50 shrink-0">
                    {prefix}
                  </span>
                  <span>{line}</span>
                </div>
              ))}
            </div>
          );
        })}
      </pre>
    </div>
  );
}
