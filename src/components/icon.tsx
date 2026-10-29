import type { CSSProperties, HTMLAttributes } from 'react';
import './icon.css';

export const ICON_NAMES = [
  'squares-four',
  'chat-circle',
  'bookmark-simple',
  'sliders-horizontal',
  'gear-six',
  'plus',
  'arrow-up-right',
  'arrow-right',
  'caret-down',
  'caret-right',
  'caret-up-down',
  'arrow-up',
  'buildings',
  'calendar-blank',
  'info',
  'files',
  'trend-up',
  'arrows-left-right',
  'chart-bar',
  'dots-three',
  'check',
  'x',
  'arrow-counter-clockwise',
  'magnifying-glass',
  'sidebar-simple',
  'user-circle',
  'shield-check',
  'download-simple',
  'stop',
  'spinner-gap',
  'sign-out',
  'clock-counter-clockwise',
  'table',
  'database',
  'graduation-cap',
  'lightning',
  'book-open',
  'key',
  'arrows-out-simple',
  'plugs-connected',
  'lock-key',
  'stack',
  'shield',
  'arrow-left',
  'building-office',
] as const;
export type IconName = (typeof ICON_NAMES)[number];
export interface IconProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  name: IconName;
  size?: number | string;
}
const paths = Object.fromEntries(
  ICON_NAMES.map((name) => [name, `/design-preview/icons/${name}.svg`]),
) as Record<IconName, string>;

/** Local Phosphor Regular assets; decorative by default, labelled when requested. */
export function Icon({ name, size = 18, className = '', style, ...props }: IconProps) {
  const path = Object.hasOwn(paths, name) ? paths[name] : undefined;
  if (!path) return null;
  const label = props['aria-label'] || props['aria-labelledby'];
  const mask: CSSProperties = {
    flexShrink: 0,
    verticalAlign: 'middle',
    width: size,
    height: size,
    backgroundColor: 'currentColor',
    mask: `url("${path}") center / contain no-repeat`,
    WebkitMask: `url("${path}") center / contain no-repeat`,
    ...style,
  };
  return (
    <span
      role={label ? 'img' : undefined}
      aria-hidden={label ? undefined : true}
      {...props}
      className={`kaia-icon ${className}`.trim()}
      style={mask}
    />
  );
}

type AliasProps = Omit<IconProps, 'name'>;
function alias(name: IconName) {
  return function PhosphorIcon(props: AliasProps) {
    return <Icon name={name} {...props} />;
  };
}
// Compatibility exports keep existing controls and accessible names unchanged.
export const ArrowUp = alias('arrow-up');
export const ArrowUpRight = alias('arrow-up-right');
export const ArrowRight = alias('arrow-right');
export const ArrowLeft = alias('arrow-left');
export const Plus = alias('plus');
export const PanelLeftClose = alias('sidebar-simple');
export const PanelLeftOpen = alias('sidebar-simple');
export const MessageSquare = alias('chat-circle');
export const Bookmark = alias('bookmark-simple');
export const SlidersHorizontal = alias('sliders-horizontal');
export const Settings2 = alias('gear-six');
export const Clock3 = alias('clock-counter-clockwise');
export const ChevronDown = alias('caret-down');
export const ChevronRight = alias('caret-right');
export const ChevronUpDown = alias('caret-up-down');
export const Database = alias('database');
export const GraduationCap = alias('graduation-cap');
export const ChartNoAxesCombined = alias('trend-up');
export const ChartNoAxesColumnIncreasing = alias('chart-bar');
export const FileText = alias('files');
export const Zap = alias('lightning');
export const Check = alias('check');
export const LoaderCircle = alias('spinner-gap');
export const Square = alias('stop');
export const RotateCcw = alias('arrow-counter-clockwise');
export const Download = alias('download-simple');
export const LogOut = alias('sign-out');
export const Search = alias('magnifying-glass');
export const Info = alias('info');
export const BookOpen = alias('book-open');
export const ShieldCheck = alias('shield-check');
export const Shield = alias('shield');
export const X = alias('x');
export const PlugZap = alias('plugs-connected');
export const ExternalLink = alias('arrow-up-right');
export const Table2 = alias('table');
export const Expand = alias('arrows-out-simple');
export const Building2 = alias('building-office');
export const LockKeyhole = alias('lock-key');
export const KeyRound = alias('key');
export const Layers = alias('stack');
export const Server = alias('database');
