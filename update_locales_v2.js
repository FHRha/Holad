const fs = require('fs');

function setDeep(obj, path, value) {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) current[parts[i]] = {};
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

const ruPath = 'e:/Code/StreamNavi/client/public/locales/ru/translation.json';
const enPath = 'e:/Code/StreamNavi/client/public/locales/en/translation.json';

const ru = JSON.parse(fs.readFileSync(ruPath, 'utf8'));
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));

const translations = [
  ["jam.kicked", "Вас исключили из сессии", "You have been kicked from the session"],
  ["player.playing_on_device", "Музыка играет на устройстве ", "Music is playing on device "],
  ["sync.title", "Синхронизация Истории", "History Sync"],
  ["sync.conflict", "Конфликт устройств", "Device Conflict"],
  ["sync.description_part2", "Хочешь восстановить эту историю сюда, или ты специально очистил кэш и хочешь удалить историю отовсюду?", "Do you want to restore this history here, or did you intentionally clear your cache and want to delete history from everywhere?"],
  ["sync.restore", "Восстановить историю", "Restore history"],
  ["sync.delete_everywhere", "Удалить отовсюду", "Delete from everywhere"],
  ["views.search_tracks", "Поиск...", "Search..."],
  ["common.offline", "Офлайн", "Offline"],
  ["common.downloaded", "Загружено", "Downloaded"],
  ["sidebar.favorites", "Избранное", "Favorites"],
  ["views.artists_short_tab", "Исполните...", "Artists..."],
  ["common.playlists", "Плейлисты", "Playlists"],
  ["views.listening_history", "История прослушивания", "Listening history"],
  ["views.tracks_count_label", "треки", "tracks"],
  ["views.time_label", "время", "time"],
  ["views.artists_short", "исполн.", "artists"],
  ["views.streak_label", "серия", "streak"],
  ["views.on_the_wave", "На волне", "On the wave"],
  ["common.shuffle", "Перемешать", "Shuffle"],
  ["views.recently_played", "Недавно играло", "Recently played"],
  ["views.frequently_played", "Часто слушаете", "Frequently played"],
  ["topbar.search", "Поиск...", "Search..."],
  ["views.search_favorite_music", "Найдите любимую музыку", "Find your favorite music"],
  ["views.search_desc", "Введите название трека, исполнителя или альбома для поиска.", "Enter the name of a track, artist or album to search."],
  ["sidebar.tracks", "Треки", "Tracks"],
  ["sidebar.albums", "Альбомы", "Albums"],
  ["sidebar.artists", "Исполнители", "Artists"],
  ["settings.add_color", "Добавить цвет", "Add color"],
  ["settings.edit_color", "Редактировать цвет", "Edit color"],
  ["settings.custom_color_select", "Выбор своего цвета", "Custom color selection"],
  ["settings.hue", "Оттенок", "Hue"],
  ["settings.saturation", "Насыщенность", "Saturation"],
  ["settings.lightness", "Яркость", "Lightness"],
  ["settings.save_and_close", "Сохранить и закрыть", "Save and close"],
  ["settings.replace_queue", "Заменить очередь (Play Now)", "Replace queue (Play Now)"],
  ["settings.add_to_end", "Добавить в конец (Play Next)", "Add to end (Play Next)"],
  ["settings.auto_dj_desc", "Автоматически добавлять похожие треки по окончании очереди", "Automatically add similar tracks at the end of the queue"],
  ["player.playing_on", "Играет на", "Playing on"],
  ["player.connect_to_device", "Подключиться к устройству", "Connect to device"],
  ["player.this_browser", "Этот браузер", "This browser"],
  ["player.listening_here", "Слушаем здесь", "Listening here"],
  ["player.devices_not_found", "Устройства не найдены", "Devices not found"],
  ["player.duration", "Длительность", "Duration"],
  ["player.info.year", "Год", "Year"],
  ["player.info.format", "Формат", "Format"],
  ["player.info.bitrate", "Битрейт", "Bitrate"],
  ["player.about_artist", "Об исполнителе", "About Artist"],
  ["player.no_biography", "Биография недоступна.", "No biography available."],
  ["player.now_playing", "Играет", "Now playing"],
  ["player.sleepTimer", "Таймер сна", "Sleep Timer"],
  ["player.timer.15m", "15 минут", "15 Minutes"],
  ["player.timer.30m", "30 минут", "30 Minutes"],
  ["player.timer.60m", "1 час", "1 Hour"],
  ["player.timer.trackEnd", "Конец трека", "End of Track"],
  ["player.timer.off", "Выключить", "Turn Off"],
  ["jam.session", "Jam-сессия", "Jam Session"],
  ["player.sync", "Синхронизация", "Sync"],
  ["player.loading_lyrics", "Загрузка текста...", "Loading lyrics..."],
  ["player.lyrics_not_found", "Текст не найден", "Lyrics not found"],
  ["player.bookmarksPlaylist", "Отложенное", "Bookmarks"],
  ["player.next_in_queue", "Далее в очереди", "Next in Queue"],
  ["player.queue_is_empty", "Очередь пуста", "Queue is empty"],
  ["views.sent", "Отправлено", "Sent"],
  ["views.title", "Название", "Title"],
  ["views.unknown_label", "Неизвестный лейбл", "Unknown Label"],
  ["views.search_placeholder", "Поиск...", "Search..."],
  ["views.filter_offline", "Офлайн", "Offline"],
  ["views.filter_downloaded", "Загружено", "Downloaded"],
  ["views.tab_tracks", "Песни", "Tracks"],
  ["views.tab_albums", "Альбомы", "Albums"],
  ["views.tab_artists", "Исполнители", "Artists"],
  ["views.no_favorite_tracks", "Нет избранных песен", "No favorite tracks"],
  ["views.no_favorite_tracks_desc", "Отметьте ваши любимые песни, и они появятся здесь или проверьте фильтры", "Mark your favorite tracks, and they will appear here or check your filters"],
  ["views.no_favorite_albums", "Нет избранных альбомов", "No favorite albums"],
  ["views.no_favorite_albums_desc", "Отметьте ваши любимые альбомы, и они появятся здесь или проверьте фильтры", "Mark your favorite albums, and they will appear here or check your filters"],
  ["views.no_favorite_artists", "Нет избранных исполнителей", "No favorite artists"],
  ["views.no_favorite_artists_desc", "Отметьте ваших любимых исполнителей, и они появятся здесь или проверьте фильтры", "Mark your favorite artists, and they will appear here or check your filters"],
  ["views.mins_abbr", "м", "m"],
  ["views.hours_abbr", "ч", "h"],
  ["views.time_just_now", "Только что", "Just now"],
  ["views.time_mins_ago", "минут назад", "minutes ago"],
  ["views.time_hours_ago", "часов назад", "hours ago"],
  ["views.time_yesterday", "Вчера", "Yesterday"],
  ["views.time_days_ago", "дней назад", "days ago"],
  ["views.period_7d", "7 дней", "7 days"],
  ["views.period_30d", "30 дней", "30 days"],
  ["views.period_90d", "90 дней", "90 days"],
  ["views.period_all", "Всё время", "All time"],
  ["views.history_title", "История и Статистика", "History and Statistics"],
  ["views.history_desc", "Твоя личная аналитика прослушиваний", "Your personal listening analytics"],
  ["views.stat_tracks", "Треки", "Tracks"],
  ["views.stat_time", "Время", "Time"],
  ["views.stat_artists", "Артисты", "Artists"],
  ["views.days_abbr", "дн.", "d."],
  ["views.stat_streak", "Серия", "Streak"],
  ["views.top_artists", "Топ исполнителей", "Top artists"],
  ["views.times", "раз", "times"],
  ["views.no_data", "Нет данных за этот период", "No data for this period"],
  ["views.top_tracks", "Топ треков", "Top tracks"],
  ["views.top_albums", "Топ альбомов", "Top albums"],
  ["views.history_empty", "История пуста", "History is empty"],
  ["views.settings_server_account", "Сервер и аккаунт", "Server and account"],
  ["views.settings_server_desc", "Данные сервера, сканирование библиотеки, учетные данные, выход из аккаунта", "Server data, library scanning, credentials, logout"],
  ["views.logout", "Выйти из аккаунта", "Log out"],
  ["views.settings_appearance", "Внешний вид", "Appearance"],
  ["views.settings_appearance_desc", "Тема, цвет приложения, сортировка, представления коллекций (сеткой/списком)", "Theme, app color, sorting, collection views"],
  ["views.settings_theme", "Тема", "Theme"],
  ["views.settings_accent", "Цвет акцента", "Accent color"],
  ["views.settings_color_setup", "Настройка цвета", "Color setup"],
  ["views.settings_audio", "Звук и воспроизведение", "Audio and playback"],
  ["views.settings_audio_desc", "Качество стриминга, качество загрузки, управление плеером", "Streaming quality, download quality, player control"],
  ["views.settings_click_action", "Действие по клику", "Click action"],
  ["views.settings_play_now", "Заменить очередь", "Play now (replace queue)"],
  ["views.settings_play_next", "Добавить в конец", "Play next (add to end)"],
  ["views.settings_default_volume", "Громкость по умолчанию", "Default volume"],
  ["views.settings_autodj", "Авто DJ", "Auto DJ"],
  ["views.settings_autodj_desc", "Добавлять похожие треки", "Add similar tracks"],
  ["views.settings_network", "Сетевое подключение", "Network"],
  ["views.settings_network_desc", "Офлайн-режим, доверенные SSL-сертификаты", "Offline mode, trusted SSL certificates"],
  ["views.settings_wip", "В разработке...", "Work in progress..."],
  ["views.settings_storage", "Хранилище", "Storage"],
  ["views.settings_storage_desc", "Управление кешами, загрузки, лимиты хранения", "Cache management, downloads, storage limits"],
  ["views.playlists", "Плейлисты", "Playlists"],
  ["views.no_playlists", "Нет плейлистов", "No playlists"],
  ["views.no_playlists_desc", "Создайте свой первый плейлист, чтобы сохранить любимую музыку.", "Create your first playlist to save your favorite music."],
  ["views.search_albums", "Поиск альбома...", "Search album..."],
  ["views.album", "Альбом", "Album"],
  ["views.genre", "Жанр", "Genre"],
  ["views.year", "Год", "Year"],
  ["views.radio_no_tracks", "Не удалось найти треки для радио", "Could not find tracks for radio"],
  ["views.radio_error", "Ошибка запуска радио", "Error starting radio"],
  ["views.top", "Топ ", "Top "],
  ["views.time_h", "ч", "h"],
  ["views.days_short", "дн.", "d."],
  ["settings.startPage", "Стартовая страница", "Start page"],
  ["settings.start_home", "Главная", "Home"],
  ["settings.start_albums", "Альбомы", "Albums"],
  ["settings.start_radio", "Радио", "Radio"],
  ["settings.start_favorites", "Избранное", "Favorites"]
];

for (let i = 0; i < translations.length; i++) {
  const row = translations[i];
  if (!Array.isArray(row) || row.length !== 3) {
    console.error("Invalid row at", i, row);
  }
}

for (const [key, ruVal, enVal] of translations) {
  setDeep(ru, key, ruVal);
  setDeep(en, key, enVal);
}

fs.writeFileSync(ruPath, JSON.stringify(ru, null, 2), 'utf8');
fs.writeFileSync(enPath, JSON.stringify(en, null, 2), 'utf8');

console.log('Successfully updated locales.');
