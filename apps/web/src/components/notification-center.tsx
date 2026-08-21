"use client";

import Link from "next/link";
import { useState } from "react";

import { workspaceRequest } from "./workspace-api";

interface Notification {
  body: string | null;
  createdAt: string;
  id: string;
  routeId: string | null;
  routeType: string | null;
  state: "dismissed" | "read" | "unread";
  title: string;
  type: string;
}

export const NotificationCenter = ({
  delegate,
  initial,
}: {
  delegate: boolean;
  initial: Notification[];
}) => {
  const [notifications, setNotifications] = useState(initial);
  const [message, setMessage] = useState("");

  const update = async (id: string, state: "dismissed" | "read") => {
    try {
      await workspaceRequest(`/api/notifications/${id}`, "PATCH", { state });
      setNotifications((current) =>
        state === "dismissed"
          ? current.filter((notification) => notification.id !== id)
          : current.map((notification) =>
              notification.id === id ? { ...notification, state } : notification,
            ),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The notification could not be updated.");
    }
  };

  const destination = (notification: Notification): string | null => {
    if (delegate && (notification.routeType === "project" || notification.routeType === "task"))
      return "/delegated";
    if (notification.routeType === "task" && notification.routeId !== null)
      return `/?task=${encodeURIComponent(notification.routeId)}`;
    if (notification.routeType === "project" && notification.routeId !== null)
      return `/?project=${encodeURIComponent(notification.routeId)}`;
    if (notification.routeType === "delegations") return "/delegations";
    if (notification.routeType === "notifications" && !delegate) return "/compliance";
    return null;
  };

  return (
    <section className="notification-list" aria-labelledby="notifications-heading">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Access-aware alerts</p>
          <h2 id="notifications-heading">Notifications</h2>
        </div>
        <span>
          {notifications.filter((notification) => notification.state === "unread").length} unread
        </span>
      </div>
      {message ? (
        <p className="form-message error" role="alert">
          {message}
        </p>
      ) : null}
      {notifications.map((notification) => (
        <article className={`notification-card ${notification.state}`} key={notification.id}>
          <div>
            <p className="eyebrow">{notification.type.replaceAll("_", " ")}</p>
            <h3>{notification.title}</h3>
            {notification.body !== null ? <p>{notification.body}</p> : null}
            <time dateTime={notification.createdAt}>
              {new Date(notification.createdAt).toLocaleString()}
            </time>
          </div>
          <div className="table-actions">
            {destination(notification) === null ? null : (
              <Link
                className="button-link secondary compact"
                href={destination(notification) ?? "#"}
              >
                Open
              </Link>
            )}
            {notification.state === "unread" ? (
              <button
                className="secondary compact"
                onClick={() => void update(notification.id, "read")}
              >
                Mark read
              </button>
            ) : null}
            <button
              className="secondary compact"
              onClick={() => void update(notification.id, "dismissed")}
            >
              Dismiss
            </button>
          </div>
        </article>
      ))}
      {notifications.length === 0 ? (
        <div className="empty-state">
          <h3>All clear</h3>
          <p>No active notifications.</p>
        </div>
      ) : null}
    </section>
  );
};
