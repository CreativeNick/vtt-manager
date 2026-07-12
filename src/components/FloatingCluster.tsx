import type { ReactNode } from "react";

export type ClusterAnchor =
  | "top-left"
  | "top-center"
  | "top-right"
  | "left"
  | "right"
  | "bottom-left"
  | "bottom-right";

type FloatingClusterProps = {
  anchor: ClusterAnchor;
  children: ReactNode;
  /** Stack children vertically (default for side/panel anchors). */
  column?: boolean;
  /** Skip the panel background/border/shadow — just position the children. */
  plain?: boolean;
  className?: string;
};

/// <summary>
/// A floating, pointer-interactive UI cluster anchored to a screen edge/corner,
/// rendered over the full-bleed map. The building block for all in-campaign UI.
/// </summary>
export function FloatingCluster({ anchor, children, column, plain, className }: FloatingClusterProps) {
  const classes = ["cluster", `cluster--${anchor}`];
  if (column) {
    classes.push("cluster--col");
  }
  if (plain) {
    classes.push("cluster--plain");
  }
  if (className) {
    classes.push(className);
  }
  return <div className={classes.join(" ")}>{children}</div>;
}
