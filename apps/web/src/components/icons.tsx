/** Hairline icons in the references' drawing style: 1.5px strokes, rounded, currentColor. Always decorative (aria-hidden). */
import type { ReactNode } from "react";

function Icon({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}
export const LockIcon = ({ size }: { size?: number }) => <Icon size={size}><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></Icon>;
export const PinIcon = ({ size }: { size?: number }) => <Icon size={size}><path d="M12 21s-6.5-6.2-6.5-11A6.5 6.5 0 0 1 18.5 10c0 4.8-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/></Icon>;
export const CalendarIcon = ({ size }: { size?: number }) => <Icon size={size}><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></Icon>;
export const ClockIcon = ({ size }: { size?: number }) => <Icon size={size}><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></Icon>;
export const DocIcon = ({ size }: { size?: number }) => <Icon size={size}><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></Icon>;
export const PhotoIcon = ({ size }: { size?: number }) => <Icon size={size}><rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-5 4 4 3-3 4 4"/></Icon>;
export const PersonIcon = ({ size }: { size?: number }) => <Icon size={size}><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c1.2-4 4-6 7.5-6s6.3 2 7.5 6"/></Icon>;
export const PeopleIcon = ({ size }: { size?: number }) => <Icon size={size}><circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.9-3.4 3.2-5.2 6-5.2s5.1 1.8 6 5.2M15.5 5.6a3 3 0 0 1 0 5.8M17.5 14.6c1.8.6 3 2.2 3.5 4.9"/></Icon>;
export const ShieldIcon = ({ size }: { size?: number }) => <Icon size={size}><path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z"/><path d="m9 12 2 2 4-4"/></Icon>;
export const AlertIcon = ({ size }: { size?: number }) => <Icon size={size}><path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.3"/></Icon>;
export const CheckIcon = ({ size }: { size?: number }) => <Icon size={size}><circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.8-5"/></Icon>;
export const InfoIcon = ({ size }: { size?: number }) => <Icon size={size}><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/></Icon>;
export const DownloadIcon = ({ size }: { size?: number }) => <Icon size={size}><path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19.5h14"/></Icon>;
export const LinkIcon = ({ size }: { size?: number }) => <Icon size={size}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/></Icon>;
export const SearchIcon = ({ size }: { size?: number }) => <Icon size={size}><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/></Icon>;
export const MapIcon = ({ size }: { size?: number }) => <Icon size={size}><path d="m3.5 6 5-2 7 2.5 5-2v14l-5 2-7-2.5-5 2z"/><path d="M8.5 4v14M15.5 6.5v14"/></Icon>;
export const ListIcon = ({ size }: { size?: number }) => <Icon size={size}><path d="M9 7h11M9 12h11M9 17h11M4.5 7h.2M4.5 12h.2M4.5 17h.2"/></Icon>;
export const FlaskIcon = ({ size }: { size?: number }) => <Icon size={size}><path d="M9.5 3.5h5M10.5 3.5v5.5L5 18.5A1.5 1.5 0 0 0 6.3 20.7h11.4a1.5 1.5 0 0 0 1.3-2.2L13.5 9V3.5"/><path d="M7.6 15h8.8"/></Icon>;
export const StationIcon = ({ size }: { size?: number }) => <Icon size={size}><circle cx="12" cy="12" r="2.2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/></Icon>;
export const ClipboardIcon = ({ size }: { size?: number }) => <Icon size={size}><rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5V3h6v1.5M8.5 11h7M8.5 15h5"/></Icon>;
export const TargetIcon = ({ size }: { size?: number }) => <Icon size={size}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/></Icon>;
export const LayersIcon = ({ size }: { size?: number }) => <Icon size={size}><path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5l8.5 4.5 8.5-4.5"/></Icon>;
export const QuestionIcon = ({ size }: { size?: number }) => <Icon size={size}><circle cx="12" cy="12" r="8.5"/><path d="M9.7 9.5a2.4 2.4 0 1 1 3.5 2.1c-.8.5-1.2 1-1.2 1.9M12 16.8v.2"/></Icon>;
export const BinocularsIcon = ({ size }: { size?: number }) => <Icon size={size}><circle cx="6.5" cy="15.5" r="3.5"/><circle cx="17.5" cy="15.5" r="3.5"/><path d="M10 15.5h4M4 13l2-7h3l1 6M20 13l-2-7h-3l-1 6"/></Icon>;
export const HistoryIcon = ({ size }: { size?: number }) => <Icon size={size}><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.6M4 4v4.6h4.6"/><path d="M12 8v4.2l3 1.8"/></Icon>;
export const PackageIcon = ({ size }: { size?: number }) => <Icon size={size}><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></Icon>;
export const SettingsIcon = ({ size }: { size?: number }) => <Icon size={size}><circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M4.2 7.5l2.2 1.3M17.6 15.2l2.2 1.3M4.2 16.5l2.2-1.3M17.6 8.8l2.2-1.3"/></Icon>;
export const WrenchIcon = ({ size }: { size?: number }) => <Icon size={size}><path d="M14.5 4.5a4.5 4.5 0 0 0 4.9 6.2L20 11l-9 9a2.1 2.1 0 0 1-3-3l9-9 .3.6"/></Icon>;
export const BookIcon = ({ size }: { size?: number }) => <Icon size={size}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5"/></Icon>;
export const LeafIcon = ({ size }: { size?: number }) => <Icon size={size}><path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15Z"/><path d="M5 19 14 10"/></Icon>;
export const SendIcon = ({ size }: { size?: number }) => <Icon size={size}><path d="m20.5 3.5-17 7 7 2.5 2.5 7z"/><path d="m10.5 13 10-9.5"/></Icon>;
export const EyeIcon = ({ size, off = false }: { size?: number; off?: boolean }) => <Icon size={size}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>{off ? <path d="m4 20 16-16"/> : null}</Icon>;
export const PlusIcon = ({ size }: { size?: number }) => <Icon size={size}><circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/></Icon>;
export const ChevronIcon = ({ size = 18 }: { size?: number }) => <Icon size={size}><path d="m9 6 6 6-6 6"/></Icon>;
