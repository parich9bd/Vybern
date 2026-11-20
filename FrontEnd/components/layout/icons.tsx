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
  return <Icon {...props}><path d="M3 11h4l1 6h3l1-4h0l1 4h3l1-6h4" /><path d="M7 11a4 4 0 0 1 8 0M7 11a4 4 0 0 0 8 0" /></Icon>;
}

export function UserIcon(props: IconProps) {
  return <Icon {...props}><circle cx="12" cy="8" r="3.25" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></Icon>;
}

export function LanguagesIcon(props: IconProps) {
  return <Icon {...props}><path d="M5 4h8M9 4c0 7-4 10-4 10M6 9h6M13 20h6M16 13l3 7m-1.5-3.5h-3" /></Icon>;
}

export function ChevronIcon(props: IconProps) {
  return <Icon {...props}><path d="m7 10 5 5 5-5" /></Icon>;
}

export function CheckIcon(props: IconProps) {
  return <Icon {...props}><path d="m5 12 4.25 4L19 7" /></Icon>;
}
