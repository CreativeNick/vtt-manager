type JoinIconProps = {
  className?: string;
  size?: number;
};

/// <summary>
/// Shared SVG props for decorative join-screen icons.
/// </summary>
function iconProps({ className, size = 18 }: JoinIconProps) {
  return {
    className,
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

/// <summary>
/// Magnifying glass for the campaign search field.
/// </summary>
export function JoinSearchIcon(props: JoinIconProps) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16.5 16.5 20 20" />
    </svg>
  );
}

/// <summary>
/// Scroll icon for campaign room headings and list items.
/// </summary>
export function JoinCampaignIcon(props: JoinIconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M8 5.5h9a2 2 0 0 1 2 2v11.5H9a2 2 0 0 0-2 2V7.5a2 2 0 0 1 2-2Z" />
      <path d="M8 5.5V19a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2Z" />
      <path d="M11 9.5h5M11 13h5" />
    </svg>
  );
}

/// <summary>
/// Table icon for the session column heading.
/// </summary>
export function JoinSessionIcon(props: JoinIconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 9h16M6 9v2.5M10 9v2.5M14 9v2.5M18 9v2.5" />
      <path d="M5 11.5h14v2a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-2Z" />
    </svg>
  );
}

/// <summary>
/// Crown icon for the dungeon master role card.
/// </summary>
export function JoinDmIcon(props: JoinIconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M5 17h14M6.5 17 8 9l4 3 4-3 1.5 8" />
      <path d="M8 9 6 6.5h3L12 4l3 2.5h3L16 9" />
    </svg>
  );
}

/// <summary>
/// User silhouette for the player role card and character slots.
/// </summary>
export function JoinPlayerIcon(props: JoinIconProps) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M6.5 19c.9-2.8 3-4.5 5.5-4.5s4.6 1.7 5.5 4.5" />
    </svg>
  );
}

/// <summary>
/// Checkmark shown on the selected campaign.
/// </summary>
export function JoinCheckIcon(props: JoinIconProps) {
  return (
    <svg {...iconProps({ ...props, size: props.size ?? 16 })}>
      <path d="m6 12.5 3.5 3.5L18 8" />
    </svg>
  );
}

/// <summary>
/// X icon for closing join-screen dialogs.
/// </summary>
export function JoinCloseIcon(props: JoinIconProps) {
  return (
    <svg {...iconProps({ ...props, size: props.size ?? 18 })}>
      <path d="m7 7 10 10M17 7 7 17" />
    </svg>
  );
}

/// <summary>
/// Right arrow shown after the enter campaign label.
/// </summary>
export function JoinEnterIcon(props: JoinIconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M5 12h12" />
      <path d="m13 7.5 4.5 4.5L13 16.5" />
    </svg>
  );
}

/// <summary>
/// Spinner segments for lobby connection status.
/// </summary>
export function JoinSpinnerIcon(props: JoinIconProps) {
  return (
    <svg {...iconProps({ ...props, size: props.size ?? 16 })}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

/// <summary>
/// Warning triangle for lobby errors.
/// </summary>
export function JoinAlertIcon(props: JoinIconProps) {
  return (
    <svg {...iconProps({ ...props, size: props.size ?? 16 })}>
      <path d="M12 5 4.5 18h15L12 5Z" />
      <path d="M12 10v4M12 17.5v.5" />
    </svg>
  );
}
