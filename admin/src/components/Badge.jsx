const variants = {
  blue:    'bg-blun-blue/15 text-blun-blue',
  green:   'bg-blun-green/15 text-blun-green',
  red:     'bg-blun-red/15 text-blun-red',
  yellow:  'bg-blun-yellow/15 text-blun-yellow',
  neutral: 'bg-white/5 text-blun-fg3',
};

export default function Badge({ children, variant = 'neutral' }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
        variants[variant] ?? variants.neutral
      }`}
    >
      {children}
    </span>
  );
}
