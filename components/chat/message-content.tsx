"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ponytail: markdown hanya untuk pesan companion. react-markdown default-nya
// escape raw HTML (aman injeksi); satu-satunya override = link buka tab baru.

export function CompanionContent({ content }: { content: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none prose-p:my-2 prose-pre:rounded-2xl prose-pre:border prose-pre:border-white/10 prose-pre:bg-black/60">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
