import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" {...props}>
      {children}
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return <Icon {...props}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></Icon>;
}

export function BagIcon(props: IconProps) {
  return <Icon {...props}><path d="M5 8.5h14l-1 11H6l-1-11Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></Icon>;
}

export function MenuIcon(props: IconProps) {
  return <Icon {...props}><path d="M4 7h16M4 12h16M4 17h16" /></Icon>;
}

export function CloseIcon(props: IconProps) {
  return <Icon {...props}><path d="m6 6 12 12M18 6 6 18" /></Icon>;
}

export function GlassesIcon(props: IconProps) {
  return <Icon {...props}><path d="M3.5 10.2h3l1.1 6.1a1.8 1.8 0 0 0 1.8 1.5h1.2a1.8 1.8 0 0 0 1.7-1.2l.7-2 .7 2a1.8 1.8 0 0 0 1.7 1.2h1.2a1.8 1.8 0 0 0 1.8-1.5l1.1-6.1h3" /><path d="M6.5 10.2C6.8 7.8 8.4 6.4 10.5 6.4s3.4 1.1 3.5 2.8c.4-1.7 1.7-2.8 3.5-2.8 2.1 0 3.7 1.4 4 3.8" /><path d="M11.8 10.2h.4" /></Icon>;
}

export function UserIcon(props: IconProps) {
  return <Icon {...props}><circle cx="12" cy="8" r="3.25" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></Icon>;
}

export function OrdersIcon(props: IconProps) { return <Icon {...props}><path d="M6 4h12v16H6zM9 8h6M9 12h6M9 16h3" /></Icon>; }
export function LocationIcon(props: IconProps) { return <Icon {...props}><path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2" /></Icon>; }
export function SettingsIcon(props: IconProps) { return <Icon {...props}><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.4 1a7 7 0 0 0-2.1-1.2L14 3h-4l-.4 2.7a7 7 0 0 0-2.1 1.2l-2.4-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 2.1 1.2L10 21h4l.4-2.7a7 7 0 0 0 2.1-1.2l2.4 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" /></Icon>; }
export function LogoutIcon(props: IconProps) { return <Icon {...props}><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" /></Icon>; }
export function DashboardIcon(props: IconProps) { return <Icon {...props}><rect x="4" y="4" width="6" height="6" /><rect x="14" y="4" width="6" height="6" /><rect x="4" y="14" width="6" height="6" /><rect x="14" y="14" width="6" height="6" /></Icon>; }
export function ShieldIcon(props: IconProps) { return <Icon {...props}><path d="M12 3 19 6v5c0 4.6-2.8 8-7 10-4.2-2-7-5.4-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></Icon>; }
export function SunIcon(props: IconProps) { return <Icon {...props}><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>; }
export function MoonIcon(props: IconProps) { return <Icon {...props}><path d="M20 15.3A8.5 8.5 0 0 1 8.7 4 8.5 8.5 0 1 0 20 15.3Z" /></Icon>; }

export function LanguagesIcon(props: IconProps) {
  return <Icon {...props}><path d="M5 4h8M9 4c0 7-4 10-4 10M6 9h6M13 20h6M16 13l3 7m-1.5-3.5h-3" /></Icon>;
}

export function ChevronIcon(props: IconProps) {
  return <Icon {...props}><path d="m7 10 5 5 5-5" /></Icon>;
}

export function CheckIcon(props: IconProps) {
  return <Icon {...props}><path d="m5 12 4.25 4L19 7" /></Icon>;
}
