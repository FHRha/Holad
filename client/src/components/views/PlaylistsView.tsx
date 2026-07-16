export default function PlaylistsView() {
  return (
    <div className="flex-1 overflow-y-auto bg-transparent md:bg-card hide-scrollbar md:custom-scrollbar relative pb-24 px-4 pt-4 md:p-6">
      <div className="hidden md:flex sticky top-0 z-20 bg-card/90 backdrop-blur p-6 pb-4 border-b border-white/5 items-center justify-between -mx-6 -mt-6 mb-6">
        <h1 className="text-2xl font-bold text-foreground">Плейлисты</h1>
      </div>

      <div className="flex flex-col items-center justify-center h-64 text-[#b3b3b3]">
        <p className="text-lg font-bold mb-2">Нет плейлистов</p>
        <p className="text-sm">Создайте свой первый плейлист, чтобы сохранить любимую музыку.</p>
      </div>
    </div>
  );
}
