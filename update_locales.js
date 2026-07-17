const fs = require('fs');
const ruPath = 'e:/Code/StreamNavi/client/public/locales/ru/translation.json';
const enPath = 'e:/Code/StreamNavi/client/public/locales/en/translation.json';

const ru = JSON.parse(fs.readFileSync(ruPath, 'utf8'));
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));

// Common
ru.common.offline = 'Офлайн';
en.common.offline = 'Offline';
ru.common.downloaded = 'Загружено';
en.common.downloaded = 'Downloaded';
ru.common.favorites = 'Избранное';
en.common.favorites = 'Favorites';

// Settings
ru.settings.custom_color_select = 'Выбор своего цвета';
en.settings.custom_color_select = 'Select custom color';
ru.settings.hue = 'Оттенок';
en.settings.hue = 'Hue';
ru.settings.saturation = 'Насыщенность';
en.settings.saturation = 'Saturation';
ru.settings.lightness = 'Яркость';
en.settings.lightness = 'Lightness';
ru.settings.save_and_close = 'Сохранить и закрыть';
en.settings.save_and_close = 'Save and close';
ru.settings.replace_queue = 'Заменить очередь (Play Now)';
en.settings.replace_queue = 'Replace queue (Play Now)';
ru.settings.add_to_end = 'Добавить в конец (Play Next)';
en.settings.add_to_end = 'Add to end (Play Next)';
ru.settings.auto_dj_desc = 'Автоматически добавлять похожие треки по окончании очереди';
en.settings.auto_dj_desc = 'Automatically add similar tracks at the end of the queue';
ru.settings.edit_color = 'Редактировать цвет';
en.settings.edit_color = 'Edit color';
ru.settings.add_color = 'Добавить цвет';
en.settings.add_color = 'Add color';
ru.settings.server_and_account = 'Сервер и аккаунт';
en.settings.server_and_account = 'Server and account';
ru.settings.server_desc = 'Данные сервера, сканирование библиотеки, учетные данные, выход из аккаунта';
en.settings.server_desc = 'Server details, library scanning, credentials, logout';
ru.settings.logout_account = 'Выйти из аккаунта';
en.settings.logout_account = 'Log out of account';
ru.settings.appearance_desc = 'Тема, цвет приложения, сортировка, представления коллекций (сеткой/списком)';
en.settings.appearance_desc = 'Theme, app color, sorting, collection views (grid/list)';
ru.settings.interface = 'ИНТЕРФЕЙС';
en.settings.interface = 'INTERFACE';
ru.settings.customization = 'КАСТОМИЗАЦИЯ';
en.settings.customization = 'CUSTOMIZATION';
ru.settings.sound_playback = 'Звук и воспроизведение';
en.settings.sound_playback = 'Sound and playback';
ru.settings.sound_desc = 'Качество стриминга, качество загрузки, управление плеером';
en.settings.sound_desc = 'Streaming quality, download quality, player controls';
ru.settings.playback = 'ВОСПРОИЗВЕДЕНИЕ';
en.settings.playback = 'PLAYBACK';
ru.settings.network = 'Сетевое подключение';
en.settings.network = 'Network connection';
ru.settings.network_desc = 'Офлайн-режим, доверенные SSL-сертификаты';
en.settings.network_desc = 'Offline mode, trusted SSL certificates';
ru.settings.storage = 'Хранилище';
en.settings.storage = 'Storage';
ru.settings.storage_desc = 'Управление кешами, загрузки, лимиты хранения';
en.settings.storage_desc = 'Cache management, downloads, storage limits';

// Player
ru.player.playing_on_device = 'Музыка играет на устройстве ';
en.player.playing_on_device = 'Music is playing on device ';
ru.player.playing_on = 'Играет на ';
en.player.playing_on = 'Playing on ';
ru.player.connect_to_device = 'Подключиться к устройству';
en.player.connect_to_device = 'Connect to a device';
ru.player.this_browser = 'Этот браузер';
en.player.this_browser = 'This browser';
ru.player.listening_here = 'Слушаем здесь';
en.player.listening_here = 'Listening here';
ru.player.no_devices_found = 'Устройства не найдены';
en.player.no_devices_found = 'No devices found';
if(!ru.jam) ru.jam = {};
if(!en.jam) en.jam = {};
ru.jam.kicked = 'Вас исключили из сессии';
en.jam.kicked = 'You were kicked from the session';

// Sync
ru.sync = {
  title: 'Синхронизация Истории',
  conflict: 'Конфликт устройств',
  description_part1: 'На твоём устройстве сейчас пустая история прослушиваний. Однако по сети <span className="text-primary font-medium">Holad Connect</span> найдена история с другого устройства ({{count}} треков).',
  description_part2: 'Хочешь восстановить эту историю сюда, или ты специально очистил кэш и хочешь удалить историю отовсюду?',
  restore: 'Восстановить историю',
  delete_everywhere: 'Удалить отовсюду'
};
en.sync = {
  title: 'History Synchronization',
  conflict: 'Device conflict',
  description_part1: 'Your device currently has an empty listening history. However, over the <span className="text-primary font-medium">Holad Connect</span> network, history from another device was found ({{count}} tracks).',
  description_part2: 'Do you want to restore this history here, or did you intentionally clear the cache and want to delete history from everywhere?',
  restore: 'Restore history',
  delete_everywhere: 'Delete from everywhere'
};

// Views
ru.views.radio_tracks_failed = 'Не удалось найти треки для радио';
en.views.radio_tracks_failed = 'Failed to find tracks for radio';
ru.views.radio_start_error = 'Ошибка запуска радио';
en.views.radio_start_error = 'Error starting radio';
ru.views.listening_history = 'История прослушивания';
en.views.listening_history = 'Listening history';
ru.views.tracks_count_label = 'треки';
en.views.tracks_count_label = 'tracks';
ru.views.time_label = 'время';
en.views.time_label = 'time';
ru.views.artists_short = 'исполн.';
en.views.artists_short = 'artists';
ru.views.streak_label = 'серия';
en.views.streak_label = 'streak';
ru.views.on_the_wave = 'На волне';
en.views.on_the_wave = 'On the wave';
ru.views.recently_played = 'Недавно играло';
en.views.recently_played = 'Recently played';
ru.views.frequently_played = 'Часто слушаете';
en.views.frequently_played = 'Frequently played';
ru.views.artists_short_tab = 'Исполните...';
en.views.artists_short_tab = 'Artists...';
ru.views.search_favorite_music = 'Найдите любимую музыку';
en.views.search_favorite_music = 'Find your favorite music';
ru.views.search_desc = 'Введите название трека, исполнителя или альбома для поиска.';
en.views.search_desc = 'Enter track name, artist, or album to search.';
ru.views.no_fav_tracks = 'Нет избранных песен';
en.views.no_fav_tracks = 'No favorite tracks';
ru.views.no_fav_tracks_desc = 'Отметьте ваши любимые песни, и они появятся здесь или проверьте фильтры.';
en.views.no_fav_tracks_desc = 'Mark your favorite songs and they will appear here, or check your filters.';
ru.views.no_fav_albums = 'Нет избранных альбомов';
en.views.no_fav_albums = 'No favorite albums';
ru.views.no_fav_albums_desc = 'Отметьте ваши любимые альбомы, и они появятся здесь или проверьте фильтры.';
en.views.no_fav_albums_desc = 'Mark your favorite albums and they will appear here, or check your filters.';
ru.views.no_fav_artists = 'Нет избранных исполнителей';
en.views.no_fav_artists = 'No favorite artists';
ru.views.no_fav_artists_desc = 'Отметьте ваших любимых исполнителей, и они появятся здесь или проверьте фильтры.';
en.views.no_fav_artists_desc = 'Mark your favorite artists and they will appear here, or check your filters.';
ru.views.time_m = 'м';
en.views.time_m = 'm';
ru.views.time_h = 'ч';
en.views.time_h = 'h';
ru.views.just_now = 'Только что';
en.views.just_now = 'Just now';
ru.views.minutes_ago = 'минут назад';
en.views.minutes_ago = 'minutes ago';
ru.views.hours_ago = 'часов назад';
en.views.hours_ago = 'hours ago';
ru.views.yesterday = 'Вчера';
en.views.yesterday = 'Yesterday';
ru.views.days_ago = 'дней назад';
en.views.days_ago = 'days ago';
ru.views.days_7 = '7 дней';
en.views.days_7 = '7 days';
ru.views.days_30 = '30 дней';
en.views.days_30 = '30 days';
ru.views.days_90 = '90 дней';
en.views.days_90 = '90 days';
ru.views.all_time = 'Всё время';
en.views.all_time = 'All time';
ru.views.history_and_stats = 'История и Статистика';
en.views.history_and_stats = 'History & Statistics';
ru.views.history_desc = 'Твоя личная аналитика прослушиваний';
en.views.history_desc = 'Your personal listening analytics';
ru.views.top = 'Топ ';
en.views.top = 'Top ';
ru.views.days_short = 'дн.';
en.views.days_short = 'd.';
ru.views.top_artists = 'Топ исполнителей';
en.views.top_artists = 'Top artists';
ru.views.top_tracks = 'Топ треков';
en.views.top_tracks = 'Top tracks';
ru.views.top_albums = 'Топ альбомов';
en.views.top_albums = 'Top albums';
ru.views.history_empty = 'История пуста';
en.views.history_empty = 'History is empty';
ru.views.no_playlists = 'Нет плейлистов';
en.views.no_playlists = 'No playlists';
ru.views.no_playlists_desc = 'Создайте свой первый плейлист, чтобы сохранить любимую музыку.';
en.views.no_playlists_desc = 'Create your first playlist to save your favorite music.';
ru.views.search_album = 'Поиск альбома...';
en.views.search_album = 'Search album...';

fs.writeFileSync(ruPath, JSON.stringify(ru, null, 2), 'utf8');
fs.writeFileSync(enPath, JSON.stringify(en, null, 2), 'utf8');
console.log('Dictionaries updated!');
