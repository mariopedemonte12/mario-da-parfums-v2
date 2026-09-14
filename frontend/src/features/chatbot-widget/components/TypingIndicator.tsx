type TypingIndicatorProps = {
  statusText: string | null;
};

// Shown while a turn is in progress and no `token` has arrived yet — the mock's
// 3 pulsing dots, optionally paired with the latest `status` event's text.
export default function TypingIndicator({ statusText }: TypingIndicatorProps) {
  return (
    <div className="flex max-w-[82%] items-center gap-2 self-start rounded-2xl rounded-bl-[4px] bg-surface px-4 py-3">
      <div className="flex gap-1.5">
        <span className="chat-dot block h-1.5 w-1.5 rounded-full bg-secondary" />
        <span className="chat-dot block h-1.5 w-1.5 rounded-full bg-secondary" />
        <span className="chat-dot block h-1.5 w-1.5 rounded-full bg-secondary" />
      </div>
      {statusText && (
        <span className="font-sans text-xs font-light text-text-muted">{statusText}</span>
      )}
    </div>
  );
}
