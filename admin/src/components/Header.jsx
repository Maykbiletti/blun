export default function Header({ title, children }) {
  return (
    <header className="h-14 border-b border-blun-border flex items-center justify-between px-6">
      <h1 className="text-[15px] font-semibold">{title}</h1>
      <div className="flex items-center gap-3">
        {children}
        <div className="w-8 h-8 rounded-full bg-blun-blue/20 flex items-center justify-center text-xs font-semibold text-blun-blue">
          A
        </div>
      </div>
    </header>
  );
}
