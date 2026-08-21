"use client";

import type { ReactNode } from "react";

export interface DelegateTooltipView {
  alias: string | null;
  displayName: string;
  profileDescription: string | null;
  status?: "active" | "invite_pending";
}

export const DelayedTooltip = ({
  children,
  content,
  label,
}: {
  children: ReactNode;
  content: ReactNode;
  label: string;
}) => (
  <span aria-label={label} className="delayed-tooltip" tabIndex={0}>
    {children}
    <span className="delayed-tooltip-content" role="tooltip">
      {content}
    </span>
  </span>
);

export const HelpTip = ({ children, label }: { children: ReactNode; label: string }) => (
  <DelayedTooltip content={children} label={`Help: ${label}`}>
    <span aria-hidden="true" className="help-tip-icon">
      ?
    </span>
  </DelayedTooltip>
);

const delegateLabel = (delegate: DelegateTooltipView): string =>
  delegate.alias === null ? delegate.displayName : `${delegate.displayName} · ${delegate.alias}`;

export const DelegationIndicator = ({
  delegates,
  compact = false,
}: {
  compact?: boolean;
  delegates: readonly DelegateTooltipView[];
}) => {
  if (delegates.length === 0) return null;
  return (
    <DelayedTooltip
      content={
        <>
          <strong>Delegated to</strong>
          <ul>
            {delegates.map((delegate, index) => (
              <li key={`${delegate.displayName}:${String(index)}`}>
                <strong>{delegateLabel(delegate)}</strong>
                {delegate.status === "invite_pending" ? " · invitation pending" : ""}
                {delegate.profileDescription === null ? null : (
                  <span>{delegate.profileDescription}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      }
      label={`${String(delegates.length)} delegate${delegates.length === 1 ? "" : "s"}`}
    >
      <span className={`delegation-indicator${compact ? " compact" : ""}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-1a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20a7 7 0 0 1 14 0v1H2v-1Zm13.4-6.7A6 6 0 0 1 22 19v1h-4.1a9 9 0 0 0-2.5-6.7Z" />
        </svg>
        {compact ? null : <span>{delegates.length}</span>}
      </span>
    </DelayedTooltip>
  );
};
