(() => {
  'use strict';
  const VTW = globalThis.VTW;
  if (!VTW) return;

  const language = /^de\b/i.test(document.documentElement.lang || navigator.language || '') ? 'de' : 'en';
  const tr = (de, en) => language === 'de' ? de : en;

  const statusLabels = language === 'de' ? {
    idle: 'Bereit', active: 'Aktiv', loading: 'Lädt', disabled: 'Aus',
    warning: 'Hinweis', error: 'Fehler'
  } : {
    idle: 'Ready', active: 'Active', loading: 'Loading', disabled: 'Off',
    warning: 'Notice', error: 'Error'
  };

  const settingLabels = {
    adblock: ['Anzeigenblocker', 'Entfernt Werbedaten aus Player-, Feed-, Such- und Shorts-Antworten.'],
    sponsorblock: ['SponsorBlock', 'Erkennt Community-Segmente und überspringt sie oder zeigt einen Hinweis.'],
    dearrow: ['DeArrow', 'Ersetzt unterstützte Titel und Vorschaubilder mit Community-Versionen.'],
    dislikes: ['Dislikes zurückbringen', 'Zeigt die Dislike-Zahl oder ein Verhältnis im Player.'],
    remove_super_resolution: ['Super Resolution entfernen', 'Entfernt künstlich hochskalierte Super-Resolution-Qualitäten.'],
    hide_shorts: ['Shorts vollständig ausblenden', 'Entfernt Shorts aus Navigation, Regalen, Kacheln, Suche und Shorts-Seiten.'],
    unlock_resolution: ['Auflösung freischalten', 'Meldet YouTube TV eine maximale Videoauflösung bis 8K.'],
    controller_support: ['Xbox-Controller aktivieren', 'Aktiviert ausschließlich die native Xbox-Controller-Navigation. Es wird kein D-Pad eingeblendet.'],
    dial_enabled: ['DIAL-Geräteerkennung', 'Macht die Xbox im lokalen Netzwerk als YouTube-TV-Empfänger sichtbar.'],
    remove_endscreen: ['Endbildschirm ausblenden', 'Blendet YouTubes Endkarten und Endbildschirm aus.'],
    high_quality_thumbnails: ['Hochwertige Vorschaubilder', 'Bevorzugt hochauflösende YouTube-Vorschaubilder.'],
    preferred_quality: ['Bevorzugte Videoqualität', 'Fordert nach Möglichkeit die gewählte Qualität im originalen Player an.'],
    playback_rate: ['Wiedergabegeschwindigkeit', 'Wendet die gewählte Geschwindigkeit auf das aktuelle Video an.'],
    playback_rate_increment: ['Geschwindigkeits-Schritt', 'Legt den Schritt der Geschwindigkeits-Schaltfläche fest.'],
    player_clock: ['Uhr im Player', 'Zeigt die Uhrzeit in der originalen Player-Steuerung.'],
    block_signin_popup: ['Anmelde-Popup blockieren', 'Verhindert störende Anmeldeaufforderungen während der Wiedergabe.'],
    disable_direct_signin: ['Direkte Anmeldung deaktivieren', 'Deaktiviert die fehleranfällige Anmeldung direkt über die Fernbedienung.'],
    voice_search: ['Sprachsuche aktivieren', 'Aktiviert Browser-Mikrofonzugriff für die YouTube-TV-Sprachsuche.'],

    sponsor_mode: ['SponsorBlock-Verhalten', 'Segmente automatisch überspringen oder nur einen Hinweis anzeigen.'],
    sponsor_cat_sponsor: ['Sponsoren', 'Bezahlte Produktplatzierungen und Sponsorhinweise.'],
    sponsor_cat_intro: ['Intro', 'Einleitende Animationen und Intros.'],
    sponsor_cat_outro: ['Outro', 'Abspann und Endkartenbereiche.'],
    sponsor_cat_selfpromo: ['Eigenwerbung', 'Hinweise auf eigene Produkte, Videos oder Angebote.'],
    sponsor_cat_interaction: ['Interaktionserinnerungen', 'Like-, Abo- und Kommentaraufforderungen.'],
    sponsor_cat_preview: ['Vorschau und Rückblick', 'Vorschauen oder Wiederholungen aus dem Video.'],
    sponsor_cat_filler: ['Füllmaterial', 'Nicht wesentliche Füllabschnitte.'],
    sponsor_cat_music_offtopic: ['Musik ohne Inhalt', 'Musikabschnitte ohne relevanten Videoinhalt.'],
    sponsor_show_duration: ['Dauer im Hinweis anzeigen', 'Zeigt die übersprungene oder erkannte Segmentdauer.'],
    sponsor_allow_undo: ['Überspringen rückgängig machen', 'Bietet nach einem automatischen Sprung eine Rückgängig-Aktion an.'],

    dearrow_titles: ['Titel ersetzen', 'Verwendet verfügbare DeArrow-Community-Titel.'],
    dearrow_thumbnails: ['Vorschaubilder ersetzen', 'Verwendet verfügbare DeArrow-Community-Vorschaubilder.'],
    dearrow_original_hotkey: ['Originale per Taste anzeigen', 'Mit Umschalt+D zwischen Originalen und DeArrow-Darstellung wechseln.'],

    dislikes_mode: ['Darstellung', 'Legt fest, wie Dislikes im Player angezeigt werden.'],

    navigation_customization: ['Navigation anpassen', 'Aktiviert das individuelle Ein- und Ausblenden der linken YouTube-TV-Navigation.'],
    nav_signin: ['Anmelden anzeigen', 'Blendet den Eintrag „Anmelden“ in der Navigation ein oder aus.'],
    nav_search: ['Suchen anzeigen', 'Blendet „Suchen“ ein oder aus.'],
    nav_home: ['Startseite anzeigen', 'Blendet „Startseite“ ein oder aus.'],
    nav_shorts: ['Shorts anzeigen', 'Blendet „Shorts“ ein oder aus. Bei aktivem Shorts-Filter bleibt dieser Eintrag verborgen.'],
    nav_subscriptions: ['Abos anzeigen', 'Blendet „Abos“ ein oder aus.'],
    nav_library: ['Mediathek anzeigen', 'Blendet „Mediathek“ ein oder aus.'],
    nav_music: ['Musik anzeigen', 'Blendet „Musik“ ein oder aus.'],
    nav_movies: ['Filme & Shows anzeigen', 'Blendet „Filme & Shows“ ein oder aus.'],
    nav_live: ['Live anzeigen', 'Blendet „Live“ ein oder aus.'],
    nav_gaming: ['Gaming anzeigen', 'Blendet „Gaming“ ein oder aus.'],
    nav_news: ['Nachrichten anzeigen', 'Blendet „Nachrichten“ ein oder aus.'],
    nav_sports: ['Sport anzeigen', 'Blendet „Sport“ ein oder aus.'],
    nav_podcasts: ['Podcasts anzeigen', 'Blendet „Podcasts“ in der linken Navigation ein oder aus.'],

    toasts_enabled: ['Alle Website-Toasts', 'Schaltet sämtliche VacuumTube-Hinweise innerhalb von YouTube TV ein oder aus.'],
    toast_system: ['System-Toasts', 'Meldungen zum Laden und zum VacuumTube-Menü.'],
    toast_adblock: ['Anzeigenblocker-Toasts', 'Meldungen des Anzeigenfilters.'],
    toast_sponsorblock: ['SponsorBlock-Toasts', 'Meldungen über gefundene oder übersprungene Segmente.'],
    toast_dearrow: ['DeArrow-Toasts', 'Meldungen über geladene Titel und Vorschaubilder.'],
    toast_dislikes: ['Dislike-Toasts', 'Meldungen über geladene Dislike-Daten.'],
    toast_shorts: ['Shorts-Toasts', 'Meldungen über entfernte Shorts.'],
    toast_super_resolution: ['Super-Resolution-Toasts', 'Meldungen des Qualitätsfilters.'],
    toast_navigation: ['Navigations-Toasts', 'Meldungen über ausgeblendete Navigationseinträge.'],
    toast_diagnostics: ['Diagnose-Toasts', 'Meldungen über Diagnose und Protokollierung.'],

    diagnostics_enabled: ['Diagnose und Protokolle', 'Speichert nur technische VacuumTube-Ereignisse lokal in der Erweiterung. Protokolle werden automatisch nach drei Tagen gelöscht.'],

    hide_youtube_logo: ['YouTube-Logo ausblenden', 'Blendet das YouTube-Logo in der Leanback-Oberfläche aus.'],
    welcome_toast: ['Willkommenshinweis', 'Zeigt nach dem Start einmalig den VacuumTube-Xbox-Status an.'],
    auto_account_select: ['Konto automatisch auswählen', 'Wählt beim Start automatisch das erste verfügbare Konto aus.'],
    fix_language_settings: ['Spracheinstellung reparieren', 'Speichert die gewählte YouTube-Sprache kompatibel und lädt die Seite neu.'],
    subtitle_user_language: ['Eigene Untertitelsprache ergänzen', 'Ergänzt die Sprache des Systems im Auto-Übersetzen-Menü.'],
    subtitle_all_languages: ['Alle Übersetzungssprachen anzeigen', 'Ergänzt fehlende Auto-Übersetzungssprachen im Untertitelmenü.'],
    enable_chapters: ['Kapitelmarkierungen', 'Erkennt Zeitstempel in der Beschreibung und zeigt Kapitel auf der Player-Zeitleiste.'],
    enable_long_press: ['A-Taste lang drücken', 'Langes Drücken von A fügt das fokussierte Video zur lokalen Warteschlange hinzu.'],
    show_previous_next_buttons: ['Vorherige/Nächste Schaltflächen', 'Ergänzt passende Schaltflächen in der originalen Player-Aktionsleiste.'],
    show_speed_button: ['Geschwindigkeits-Schaltfläche', 'Ergänzt eine Schaltfläche zum Wechseln der Wiedergabegeschwindigkeit.'],
    show_mini_player_button: ['Mini-Player-Schaltfläche', 'Versucht den internen YouTube-TV-Mini-Player aufzurufen, falls unterstützt.'],
    enable_video_previews: ['Video-Vorschauen beim Fokus', 'Startet unterstützte Leanback-Vorschauen nach kurzer Fokuszeit.'],
    hide_watched_videos: ['Gesehene Videos ausblenden', 'Entfernt Kacheln ab dem gewählten angesehenen Prozentsatz.'],
    hide_watched_threshold: ['Schwelle für gesehen', 'Ab diesem Wiedergabefortschritt wird eine Kachel ausgeblendet.'],
    hide_watched_home: ['Auf Startseite anwenden', 'Blendet gesehene Videos auf der Startseite aus.'],
    hide_watched_search: ['In Suche anwenden', 'Blendet gesehene Videos in Suchergebnissen aus.'],
    hide_watched_subscriptions: ['In Abos anwenden', 'Blendet gesehene Videos in Abonnements aus.'],
    hide_are_you_still_watching: ['„Noch da?“-Hinweis ausblenden', 'Unterdrückt den YouTube-TV-Inaktivitätshinweis.'],
    show_paid_promotion_overlay: ['Hinweis auf bezahlte Werbung', 'Zeigt oder verbirgt YouTubes Einblendung für bezahlte Promotion.'],
    sort_subscriptions_alphabetically: ['Abos alphabetisch sortieren', 'Sortiert die sekundären Abonnement-Tabs alphabetisch.'],
    disable_channels_on_sidebar: ['Kanäle in der Seitenleiste ausblenden', 'Entfernt abonnierte Kanalverknüpfungen aus den Guide-Abschnitten, behält aber den Abos-Eintrag.'],
    screen_dimming: ['Bildschirm bei Inaktivität dimmen', 'Verdunkelt nur die WebView nach einer konfigurierbaren Zeit.'],
    screen_dimming_timeout: ['Dimm-Verzögerung', 'Zeit ohne Xbox-Controller-Eingabe bis zur Verdunkelung.'],
    screen_dimming_opacity: ['Dimm-Stärke', 'Legt fest, wie stark die Oberfläche abgedunkelt wird.'],
    player_clock_12h: ['12-Stunden-Uhr', 'Verwendet das 12-Stunden-Format für die Player-Uhr.'],
    player_clock_seconds: ['Sekunden anzeigen', 'Ergänzt Sekunden in der Player-Uhr.'],
    audio_only_mode: ['Nur-Audio-Modus', 'Blendet das Videobild aus, ohne den Stream umzuschreiben.'],
    pause_on_suspend: ['Bei App-Wechsel pausieren', 'Pausiert die Wiedergabe, wenn die Xbox-App angehalten wird.'],
    keep_screen_awake: ['Bildschirm bei Wiedergabe aktiv halten', 'Verhindert den Xbox-Bildschirmschoner nur während ein Video tatsächlich läuft.'],
    preferred_codec: ['Bevorzugter Codec', 'Filtert nur bei vorhandener Alternative; ohne Treffer bleiben alle Formate erhalten.'],
    startup_destination: ['Startbereich', 'Öffnet beim App-Start den gewählten YouTube-TV-Bereich.'],
    reload_start_page: ['Startbereich immer neu öffnen', 'Wendet den Startbereich auch bei einer wiederhergestellten Sitzung an.'],
    who_is_watching_enabled: ['„Wer schaut?“ anzeigen', 'Lässt die Kontoauswahl beim Start sichtbar.'],
    who_is_watching_on_exit: ['Kontoauswahl beim Beenden', 'Öffnet beim Verlassen des Players nach Möglichkeit die Kontoauswahl.'],
    signin_reminder: ['Anmeldehinweise anzeigen', 'Lässt YouTubes Anmeldehinweise in Feeds sichtbar.'],
    sponsor_cat_highlight: ['Highlight anzeigen', 'Lädt SponsorBlock-Highlight-Segmente und bietet eine Player-Schaltfläche an.'],
    sponsor_manual_intro: ['Intro manuell überspringen', 'Zeigt für Intros eine Überspringen-Aktion statt automatisch zu springen.'],
    sponsor_manual_outro: ['Outro manuell überspringen', 'Zeigt für Outros eine Überspringen-Aktion statt automatisch zu springen.'],
    sponsor_manual_filler: ['Füllmaterial manuell überspringen', 'Zeigt für Füllmaterial eine Überspringen-Aktion.'],
    sponsor_manual_interaction: ['Interaktion manuell überspringen', 'Zeigt für Interaktionserinnerungen eine Überspringen-Aktion.'],
    player_patch_enabled: ['Erweiterte Player-UI', 'Aktiviert die zusammengeführten Player-Schaltflächen und UI-Adapter.'],
    fit_video_to_screen: ['Video an Bildschirm anpassen', 'Hält das Video auf der Watch-Seite im sichtbaren Xbox-WebView-Bereich.'],
    focus_theme: ['Fokusdarstellung', 'Wählt die Fokusdarstellung für Xbox-Controller-Navigation.'],

    settings_theme: ['VacuumTube-Theme', 'Original nutzt die YouTube-TV-Darstellung. Custom ergänzt kompaktere Karten und deutlichere Statusfarben.'],
    player_show_controls: ['Player-Steuerung anzeigen', 'Blendet die gesamte Steuerleiste des YouTube-TV-Players ein oder aus.'],
    player_show_progress: ['Fortschrittsleiste anzeigen', 'Blendet Zeitleiste und Fortschrittsanzeige ein oder aus.'],
    player_show_title: ['Videotitel anzeigen', 'Blendet Titel und Metadaten im Player ein oder aus.'],
    player_show_time: ['Zeitangaben anzeigen', 'Blendet aktuelle Zeit und Videodauer ein oder aus.'],
    player_show_buttons: ['Player-Schaltflächen anzeigen', 'Blendet Wiedergabe-, Zurück-, Weiter- und weitere Hauptschaltflächen ein oder aus.'],
    player_show_captions_button: ['Untertitel-Schaltfläche anzeigen', 'Blendet die Untertitel-Schaltfläche ein oder aus.'],
    player_show_settings_button: ['Player-Einstellungen anzeigen', 'Blendet Qualitäts- und Player-Einstellungen ein oder aus.'],
    player_show_dislikes: ['Dislike-Anzeige im Player', 'Blendet die eingebettete Return-YouTube-Dislike-Anzeige ein oder aus.'],
    player_show_sponsor_markers: ['SponsorBlock-Markierungen', 'Blendet SponsorBlock-Segmente in der originalen Player-Zeitleiste ein oder aus.']
  };

  const settingLabelsEn = {
    adblock: ['Ad blocker', 'Removes ad data from player, feed, search and Shorts responses.'],
    sponsorblock: ['SponsorBlock', 'Detects community segments and skips them or shows a notification.'],
    dearrow: ['DeArrow', 'Replaces supported titles and thumbnails with community versions.'],
    dislikes: ['Restore dislikes', 'Shows the dislike count or a ratio in the player.'],
    remove_super_resolution: ['Remove Super Resolution', 'Removes artificially upscaled Super Resolution qualities.'],
    hide_shorts: ['Hide Shorts completely', 'Removes Shorts from navigation, shelves, tiles, search and Shorts pages.'],
    unlock_resolution: ['Unlock resolution', 'Reports a maximum video resolution up to 8K to YouTube TV.'],
    controller_support: ['Enable Xbox controller', 'Enables only native Xbox controller navigation. No on-screen D-pad is shown.'],
    dial_enabled: ['DIAL device discovery', 'Advertises the Xbox as a YouTube TV receiver on the local network.'],
    remove_endscreen: ['Hide end screen', 'Hides YouTube end cards and the end screen.'],
    high_quality_thumbnails: ['High quality thumbnails', 'Prefers high-resolution YouTube thumbnails.'],
    preferred_quality: ['Preferred video quality', 'Requests the selected quality from the original player when available.'],
    playback_rate: ['Playback speed', 'Applies the selected speed to the current video.'],
    playback_rate_increment: ['Speed increment', 'Sets the step used by the speed control button.'],
    player_clock: ['Player clock', 'Shows the current time inside the original player controls.'],
    block_signin_popup: ['Block sign-in popup', 'Prevents intrusive sign-in prompts during playback.'],
    disable_direct_signin: ['Disable direct sign-in', 'Disables the unreliable remote-based direct sign-in flow.'],
    voice_search: ['Enable voice search', 'Enables browser microphone access for YouTube TV voice search.'],
    sponsor_mode: ['SponsorBlock behavior', 'Automatically skip segments or only show a notification.'],
    sponsor_cat_sponsor: ['Sponsors', 'Paid product placements and sponsor messages.'],
    sponsor_cat_intro: ['Intro', 'Opening animations and intros.'],
    sponsor_cat_outro: ['Outro', 'Credits and end-card sections.'],
    sponsor_cat_selfpromo: ['Self-promotion', 'Mentions of the creator’s own products, videos or offers.'],
    sponsor_cat_interaction: ['Interaction reminders', 'Like, subscribe and comment requests.'],
    sponsor_cat_preview: ['Preview and recap', 'Previews or repeated parts of the video.'],
    sponsor_cat_filler: ['Filler', 'Non-essential filler sections.'],
    sponsor_cat_music_offtopic: ['Non-music-section music', 'Music sections without relevant video content.'],
    sponsor_show_duration: ['Show duration in notification', 'Shows the duration of the detected or skipped segment.'],
    sponsor_allow_undo: ['Allow undo after skipping', 'Offers an undo action after an automatic skip.'],
    dearrow_titles: ['Replace titles', 'Uses available DeArrow community titles.'],
    dearrow_thumbnails: ['Replace thumbnails', 'Uses available DeArrow community thumbnails.'],
    dearrow_original_hotkey: ['Show originals with a key', 'Press Shift+D to switch between original and DeArrow presentation.'],
    dislikes_mode: ['Display', 'Controls how dislikes are displayed in the player.'],
    navigation_customization: ['Customize navigation', 'Enables individual visibility controls for the left YouTube TV navigation.'],
    nav_signin: ['Show Sign in', 'Shows or hides “Sign in” in the navigation.'],
    nav_search: ['Show Search', 'Shows or hides “Search”.'],
    nav_home: ['Show Home', 'Shows or hides “Home”.'],
    nav_shorts: ['Show Shorts', 'Shows or hides “Shorts”. It remains hidden while the full Shorts filter is enabled.'],
    nav_subscriptions: ['Show Subscriptions', 'Shows or hides “Subscriptions”.'],
    nav_library: ['Show Library', 'Shows or hides “Library”.'],
    nav_music: ['Show Music', 'Shows or hides “Music”.'],
    nav_movies: ['Show Movies & TV', 'Shows or hides “Movies & TV”.'],
    nav_live: ['Show Live', 'Shows or hides “Live”.'],
    nav_gaming: ['Show Gaming', 'Shows or hides “Gaming”.'],
    nav_news: ['Show News', 'Shows or hides “News”.'],
    nav_sports: ['Show Sports', 'Shows or hides “Sports”.'],
    nav_podcasts: ['Show Podcasts', 'Shows or hides “Podcasts” in the left navigation.'],
    toasts_enabled: ['All website notifications', 'Enables or disables every VacuumTube notification inside YouTube TV.'],
    toast_system: ['System notifications', 'Notifications about loading and the VacuumTube menu.'],
    toast_adblock: ['Ad blocker notifications', 'Notifications from the ad filter.'],
    toast_sponsorblock: ['SponsorBlock notifications', 'Notifications about detected or skipped segments.'],
    toast_dearrow: ['DeArrow notifications', 'Notifications about loaded titles and thumbnails.'],
    toast_dislikes: ['Dislike notifications', 'Notifications about loaded dislike data.'],
    toast_shorts: ['Shorts notifications', 'Notifications about removed Shorts.'],
    toast_super_resolution: ['Super Resolution notifications', 'Notifications from the quality filter.'],
    toast_navigation: ['Navigation notifications', 'Notifications about hidden navigation entries.'],
    toast_diagnostics: ['Diagnostics notifications', 'Notifications about diagnostics and logging.'],
    diagnostics_enabled: ['Diagnostics and logs', 'Stores only technical VacuumTube events locally. Logs are deleted automatically after three days.'],
    hide_youtube_logo: ['Hide YouTube logo', 'Hides the YouTube logo in the Leanback interface.'],
    welcome_toast: ['Welcome notification', 'Shows the VacuumTube Xbox status once after startup.'],
    auto_account_select: ['Select account automatically', 'Selects the first available account during startup.'],
    fix_language_settings: ['Fix language settings', 'Stores the selected YouTube language compatibly and reloads the page.'],
    subtitle_user_language: ['Add system subtitle language', 'Adds the system language to the auto-translate menu.'],
    subtitle_all_languages: ['Show all translation languages', 'Adds missing auto-translation languages to the captions menu.'],
    enable_chapters: ['Chapter markers', 'Detects timestamps in the description and adds markers to the player timeline.'],
    enable_long_press: ['Hold the A button', 'Holding A adds the focused video to the local queue.'],
    show_previous_next_buttons: ['Previous/next buttons', 'Adds matching buttons to the original player action row.'],
    show_speed_button: ['Playback speed button', 'Adds a button for changing playback speed.'],
    show_mini_player_button: ['Mini player button', 'Attempts to open YouTube TV’s internal mini player when supported.'],
    enable_video_previews: ['Video previews on focus', 'Starts supported Leanback previews after a short focus delay.'],
    hide_watched_videos: ['Hide watched videos', 'Removes tiles at or above the selected watched percentage.'],
    hide_watched_threshold: ['Watched threshold', 'A tile is hidden after reaching this playback progress.'],
    hide_watched_home: ['Apply on Home', 'Hides watched videos on the Home page.'],
    hide_watched_search: ['Apply in Search', 'Hides watched videos in search results.'],
    hide_watched_subscriptions: ['Apply in Subscriptions', 'Hides watched videos in subscriptions.'],
    hide_are_you_still_watching: ['Hide “Are you still watching?”', 'Suppresses the YouTube TV inactivity prompt.'],
    show_paid_promotion_overlay: ['Paid promotion overlay', 'Shows or hides YouTube’s paid promotion notice.'],
    sort_subscriptions_alphabetically: ['Sort subscriptions alphabetically', 'Sorts secondary subscription tabs alphabetically.'],
    disable_channels_on_sidebar: ['Hide channels in sidebar', 'Removes subscribed-channel shortcuts from guide sections while keeping Subscriptions.'],
    screen_dimming: ['Dim screen when inactive', 'Dims only the WebView after a configurable time.'],
    screen_dimming_timeout: ['Dim delay', 'Time without Xbox controller input before dimming.'],
    screen_dimming_opacity: ['Dim strength', 'Controls how strongly the interface is darkened.'],
    player_clock_12h: ['12-hour clock', 'Uses a 12-hour format for the player clock.'],
    player_clock_seconds: ['Show seconds', 'Adds seconds to the player clock.'],
    audio_only_mode: ['Audio-only mode', 'Hides the video picture without rewriting the media stream.'],
    pause_on_suspend: ['Pause when app is suspended', 'Pauses playback when the Xbox app is suspended.'],
    keep_screen_awake: ['Keep screen awake during playback', 'Prevents the Xbox screen saver only while a video is actually playing.'],
    preferred_codec: ['Preferred codec', 'Filters only when an alternative exists; otherwise all formats remain.'],
    startup_destination: ['Startup destination', 'Opens the selected YouTube TV area when the app starts.'],
    reload_start_page: ['Always reload startup destination', 'Applies the destination to restored sessions as well.'],
    who_is_watching_enabled: ['Show “Who is watching?”', 'Keeps the account chooser visible during startup.'],
    who_is_watching_on_exit: ['Account chooser on exit', 'Attempts to open the account chooser after leaving the player.'],
    signin_reminder: ['Show sign-in reminders', 'Keeps YouTube sign-in reminders visible in feeds.'],
    sponsor_cat_highlight: ['Show highlight', 'Loads SponsorBlock highlight segments and adds a player button.'],
    sponsor_manual_intro: ['Skip intro manually', 'Shows a skip action for intros instead of skipping automatically.'],
    sponsor_manual_outro: ['Skip outro manually', 'Shows a skip action for outros instead of skipping automatically.'],
    sponsor_manual_filler: ['Skip filler manually', 'Shows a skip action for filler segments.'],
    sponsor_manual_interaction: ['Skip interaction manually', 'Shows a skip action for interaction reminders.'],
    player_patch_enabled: ['Extended player UI', 'Enables the merged player buttons and UI adapters.'],
    fit_video_to_screen: ['Fit video to screen', 'Keeps the video inside the visible Xbox WebView area on watch pages.'],
    focus_theme: ['Focus appearance', 'Selects the focus appearance for Xbox controller navigation.'],

    settings_theme: ['VacuumTube theme', 'Original follows YouTube TV. Custom adds compact cards and clearer status colors.'],
    player_show_controls: ['Show player controls', 'Shows or hides the complete YouTube TV player control bar.'],
    player_show_progress: ['Show progress bar', 'Shows or hides the timeline and progress indicator.'],
    player_show_title: ['Show video title', 'Shows or hides the title and metadata in the player.'],
    player_show_time: ['Show time labels', 'Shows or hides current time and video duration.'],
    player_show_buttons: ['Show player buttons', 'Shows or hides playback, previous, next and other primary buttons.'],
    player_show_captions_button: ['Show captions button', 'Shows or hides the captions button.'],
    player_show_settings_button: ['Show player settings', 'Shows or hides quality and player settings.'],
    player_show_dislikes: ['Show dislikes in player', 'Shows or hides the embedded Return YouTube Dislike indicator.'],
    player_show_sponsor_markers: ['SponsorBlock markers', 'Shows or hides SponsorBlock segments in the original player timeline.']
  };

  const choiceOptions = {
    settings_theme: [
      ['original', 'Original'],
      ['custom', 'Custom']
    ],
    preferred_quality: [
      ['auto', tr('Automatisch', 'Automatic')],
      ['hd1080', '1080p'], ['hd1440', '1440p'], ['hd2160', '2160p'], ['highres', '4320p']
    ],
    playback_rate: [
      ['0.25', '0.25×'], ['0.5', '0.5×'], ['0.75', '0.75×'], ['1', '1×'],
      ['1.25', '1.25×'], ['1.5', '1.5×'], ['1.75', '1.75×'], ['2', '2×'], ['2.5', '2.5×'], ['3', '3×']
    ],
    playback_rate_increment: [
      ['0.1', '0.1×'], ['0.25', '0.25×'], ['0.5', '0.5×']
    ],
    hide_watched_threshold: [
      ['70', '70%'], ['80', '80%'], ['90', '90%'], ['95', '95%'], ['100', '100%']
    ],
    screen_dimming_timeout: [
      ['30', '30 s'], ['60', '60 s'], ['120', '2 min'], ['300', '5 min'], ['600', '10 min']
    ],
    screen_dimming_opacity: [
      ['0.35', '35%'], ['0.55', '55%'], ['0.7', '70%'], ['0.85', '85%']
    ],
    preferred_codec: [
      ['any', tr('Beliebig', 'Any')], ['avc', 'H.264 / AVC'], ['vp9', 'VP9'], ['av1', 'AV1']
    ],
    startup_destination: [
      ['none', tr('Letzte Seite', 'Last page')], ['home', tr('Startseite', 'Home')],
      ['subscriptions', tr('Abos', 'Subscriptions')], ['library', tr('Mediathek', 'Library')], ['live', 'Live']
    ],
    focus_theme: [
      ['youtube', 'YouTube TV'], ['high-contrast', tr('Hoher Kontrast', 'High contrast')], ['blue', tr('Blauer Fokus', 'Blue focus')]
    ],
    sponsor_mode: [
      ['skip', tr('Automatisch überspringen', 'Skip automatically')],
      ['notify', tr('Nur Hinweis anzeigen', 'Only notify')]
    ],
    dislikes_mode: [
      ['icon_count', tr('Symbol und Anzahl', 'Icon and count')],
      ['count', tr('Nur Anzahl', 'Count only')],
      ['ratio', tr('Like-Verhältnis', 'Like ratio')],
      ['percent', tr('Dislike-Anteil', 'Dislike percentage')],
      ['hidden', tr('Nicht anzeigen', 'Hidden')]
    ]
  };

  const panels = [
    {
      id: 'appearance', title: tr('Darstellung', 'Appearance'), subtitle: tr('YouTube TV und Custom', 'YouTube TV and custom'), items: [
        { key: 'settings_theme', type: 'choice' }, { key: 'focus_theme', type: 'choice' }, 'hide_youtube_logo', 'welcome_toast'
      ]
    },
    {
      id: 'player', title: tr('Player', 'Player'), subtitle: tr('Steuerung und Darstellung', 'Controls and appearance'), items: [
        'player_patch_enabled', 'fit_video_to_screen', 'player_show_controls', 'player_show_progress',
        'player_show_title', 'player_show_time', 'player_show_buttons', 'player_show_captions_button',
        'player_show_settings_button', 'player_show_dislikes', 'player_show_sponsor_markers',
        'enable_chapters', 'show_previous_next_buttons', 'show_speed_button', 'show_mini_player_button',
        'audio_only_mode', 'remove_endscreen', 'hide_are_you_still_watching', 'show_paid_promotion_overlay',
        'player_clock', 'player_clock_12h', 'player_clock_seconds'
      ]
    },
    {
      id: 'mods', title: tr('Mods', 'Mods'), subtitle: tr('Kernfunktionen', 'Core features'), items: [
        'adblock', 'sponsorblock', 'dearrow', 'dislikes', 'remove_super_resolution',
        'hide_shorts', 'unlock_resolution', 'voice_search', 'block_signin_popup',
        'disable_direct_signin', 'signin_reminder'
      ]
    },
    {
      id: 'content', title: tr('Inhalte', 'Content'), subtitle: tr('Feeds, Vorschauen und Abos', 'Feeds, previews and subscriptions'), items: [
        'high_quality_thumbnails', 'enable_video_previews', 'hide_watched_videos',
        { key: 'hide_watched_threshold', type: 'choice' }, 'hide_watched_home',
        'hide_watched_search', 'hide_watched_subscriptions', 'sort_subscriptions_alphabetically', 'disable_channels_on_sidebar'
      ]
    },
    {
      id: 'accounts', title: tr('Konten & Sprache', 'Accounts & language'), subtitle: tr('Anmeldung und Untertitel', 'Sign-in and subtitles'), items: [
        'auto_account_select', 'who_is_watching_enabled', 'who_is_watching_on_exit',
        'fix_language_settings', 'subtitle_user_language', 'subtitle_all_languages'
      ]
    },
    {
      id: 'xbox', title: 'Xbox', subtitle: tr('Native Xbox-Funktionen', 'Native Xbox features'), items: [
        'controller_support', 'enable_long_press', 'dial_enabled', 'pause_on_suspend', 'keep_screen_awake',
        { key: 'preferred_quality', type: 'choice' }, { key: 'preferred_codec', type: 'choice' },
        { key: 'playback_rate', type: 'choice' }, { key: 'playback_rate_increment', type: 'choice' }, { key: 'startup_destination', type: 'choice' },
        'reload_start_page', 'screen_dimming', { key: 'screen_dimming_timeout', type: 'choice' },
        { key: 'screen_dimming_opacity', type: 'choice' }
      ]
    },
    {
      id: 'sponsor', title: 'SponsorBlock', subtitle: tr('Kategorien und Verhalten', 'Categories and behavior'), items: [
        { key: 'sponsor_mode', type: 'choice' }, 'sponsor_cat_sponsor', 'sponsor_cat_intro',
        'sponsor_cat_outro', 'sponsor_cat_selfpromo', 'sponsor_cat_interaction',
        'sponsor_cat_preview', 'sponsor_cat_filler', 'sponsor_cat_music_offtopic',
        'sponsor_cat_highlight', 'sponsor_manual_intro', 'sponsor_manual_outro',
        'sponsor_manual_filler', 'sponsor_manual_interaction', 'sponsor_show_duration', 'sponsor_allow_undo'
      ]
    },
    {
      id: 'dearrow', title: 'DeArrow', subtitle: tr('Titel und Vorschaubilder', 'Titles and thumbnails'), items: [
        'dearrow_titles', 'dearrow_thumbnails', 'dearrow_original_hotkey'
      ]
    },
    {
      id: 'dislikes', title: 'Dislikes', subtitle: tr('Darstellung im Player', 'Player display'), items: [
        { key: 'dislikes_mode', type: 'choice' }
      ]
    },
    {
      id: 'navigation', title: tr('Navigation', 'Navigation'), subtitle: tr('Linke Seitenleiste', 'Left sidebar'), items: [
        'navigation_customization', 'nav_signin', 'nav_search', 'nav_home', 'nav_shorts',
        'nav_subscriptions', 'nav_library', 'nav_music', 'nav_movies', 'nav_live',
        'nav_gaming', 'nav_news', 'nav_sports', 'nav_podcasts'
      ]
    },
    {
      id: 'toasts', title: tr('Toasts', 'Notifications'), subtitle: tr('Hinweise pro Mod', 'Per-mod notifications'), items: [
        'toasts_enabled', 'toast_system', 'toast_adblock', 'toast_sponsorblock',
        'toast_dearrow', 'toast_dislikes', 'toast_shorts', 'toast_super_resolution',
        'toast_navigation', 'toast_diagnostics'
      ]
    },
    {
      id: 'diagnostics', title: tr('Diagnose', 'Diagnostics'), subtitle: tr('Status und 3-Tage-Protokoll', 'Status and 3-day log'), dynamic: true
    }
  ];

  const modStatusMap = {
    adblock: 'adblock', sponsorblock: 'sponsorblock', dearrow: 'dearrow', dislikes: 'dislikes',
    hide_shorts: 'shorts', remove_super_resolution: 'super_resolution',
    unlock_resolution: 'platform', voice_search: 'platform', disable_direct_signin: 'platform',
    navigation_customization: 'navigation', controller_support: 'controller', dial_enabled: 'dial',
    enable_chapters: 'chapters', subtitle_user_language: 'subtitles', subtitle_all_languages: 'subtitles',
    screen_dimming: 'screen', keep_screen_awake: 'screen', startup_destination: 'startup', player_patch_enabled: 'player_features'
  };

  let visible = false;
  let panelIndex = 0;
  let itemIndex = 0;
  let focusArea = 'content';
  let diagnosticsLoadToken = 0;
  let pendingConfig = {};
  let pendingOriginal = {};
  let confirmVisible = false;
  let pendingLeaveAction = null;

  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'className') node.className = value;
      else if (key === 'textContent') node.textContent = value;
      else if (key === 'disabled') node.disabled = Boolean(value);
      else if (key.startsWith('data')) node.dataset[key.slice(4).replace(/^./, (char) => char.toLowerCase())] = String(value);
      else if (key === 'tabindex') node.tabIndex = Number(value);
      else if (key === 'ariaLabel') node.setAttribute('aria-label', String(value));
      else node.setAttribute(key, String(value));
    }
    for (const child of Array.isArray(children) ? children : [children]) {
      if (child) node.appendChild(child);
    }
    return node;
  };

  const effectiveValue = (key) => Object.prototype.hasOwnProperty.call(pendingConfig, key) ? pendingConfig[key] : VTW.config[key];

  const isSettingDisabled = (key) => {
    if (key.startsWith('nav_') && !effectiveValue('navigation_customization')) return true;
    if (key.startsWith('toast_') && key !== 'toasts_enabled' && !effectiveValue('toasts_enabled')) return true;
    if (['player_clock_12h', 'player_clock_seconds'].includes(key) && !effectiveValue('player_clock')) return true;
    if (['screen_dimming_timeout', 'screen_dimming_opacity'].includes(key) && !effectiveValue('screen_dimming')) return true;
    if (['hide_watched_threshold', 'hide_watched_home', 'hide_watched_search', 'hide_watched_subscriptions'].includes(key)
        && !effectiveValue('hide_watched_videos')) return true;
    if (['subtitle_user_language', 'subtitle_all_languages'].includes(key) && !effectiveValue('fix_language_settings')) return true;
    if (key.startsWith('sponsor_manual_') && !effectiveValue('sponsorblock')) return true;
    if (key === 'who_is_watching_on_exit' && !effectiveValue('who_is_watching_enabled')) return true;
    return false;
  };

  const hasPendingChanges = () => Object.keys(pendingConfig).length > 0;

  const createStatus = (key) => {
    const id = modStatusMap[key];
    if (!id) return null;
    const status = VTW.getStatus(id);
    return el('span', {
      className: `vt-setting-status vt-status-${status.state}`,
      textContent: statusLabels[status.state] || status.message || status.state
    });
  };

  const createToggle = (key) => {
    const active = Boolean(effectiveValue(key));
    return el('span', {
      className: `vt-toggle${active ? ' vt-toggle-on' : ''}`,
      dataConfig: key,
      'aria-hidden': 'true'
    }, [el('span', { className: 'vt-toggle-track' }, [el('span', { className: 'vt-toggle-thumb' })])]);
  };

  const createChoice = (key) => {
    const option = choiceOptions[key]?.find(([value]) => value === effectiveValue(key));
    return el('span', { className: 'vt-choice-value' }, [
      el('span', { textContent: option?.[1] || String(effectiveValue(key)) }),
      el('span', { className: 'vt-choice-chevron', textContent: '›' })
    ]);
  };

  const createSettingItem = (descriptor, index) => {
    const normalized = typeof descriptor === 'string' ? { key: descriptor, type: 'toggle' } : descriptor;
    const key = normalized.key;
    const labels = language === 'en' ? settingLabelsEn : settingLabels;
    const [title, description] = labels[key] || settingLabels[key] || [key, ''];
    const disabled = isSettingDisabled(key);
    const control = normalized.type === 'choice' ? createChoice(key) : createToggle(key);
    const status = createStatus(key);
    const button = el('button', {
      type: 'button',
      className: `vt-setting-item vt-focusable${disabled ? ' vt-setting-item-inactive' : ''}`,
      dataSetting: key,
      dataItemIndex: index,
      dataType: normalized.type || 'toggle',
      disabled,
      ariaLabel: `${title}. ${description}`
    }, [
      el('span', { className: 'vt-setting-info' }, [
        el('span', { className: 'vt-setting-title-row' }, [
          el('span', { className: 'vt-setting-title', textContent: title }),
          status
        ]),
        el('span', { className: 'vt-setting-description', textContent: description })
      ]),
      el('span', { className: 'vt-setting-control' }, [control])
    ]);
    button.setAttribute('aria-pressed', normalized.type === 'toggle' ? String(Boolean(effectiveValue(key))) : 'false');
    return button;
  };

  const createStaticPanel = (panel) => {
    const list = el('div', { className: 'vt-panel-list' });
    panel.items.forEach((descriptor, index) => list.appendChild(createSettingItem(descriptor, index)));
    return list;
  };

  const createDiagnosticsShell = () => el('div', {
    className: 'vt-panel-list vt-diagnostics-panel',
    dataDiagnosticsRoot: 'true'
  }, [createSettingItem('diagnostics_enabled', 0)]);

  const createOverlay = () => {
    const root = el('div', {
      id: 'vt-settings-inline-root',
      className: 'vt-settings-hidden',
      tabindex: '-1',
      role: 'region',
      'aria-label': tr('VacuumTube Einstellungen', 'VacuumTube settings')
    });
    const tabsRoot = el('div', { className: 'vt-settings-tabs', id: 'vt-settings-tabs', role: 'tablist' });
    const contentRoot = el('div', { className: 'vt-settings-content' });

    panels.forEach((panel, index) => {
      tabsRoot.appendChild(el('button', {
        type: 'button',
        className: `vt-tab vt-focusable${index === 0 ? ' vt-tab-selected' : ''}`,
        dataTab: panel.id,
        dataPanelIndex: index,
        role: 'tab',
        'aria-selected': String(index === 0)
      }, [
        el('span', { className: 'vt-tab-label', textContent: panel.title }),
        el('span', { className: 'vt-tab-subtitle', textContent: panel.subtitle })
      ]));

      contentRoot.appendChild(el('section', {
        className: `vt-content-panel${index === 0 ? ' vt-panel-active' : ''}`,
        dataPanel: panel.id,
        role: 'tabpanel'
      }, [panel.dynamic ? createDiagnosticsShell() : createStaticPanel(panel)]));
    });

    root.dataset.theme = VTW.config.settings_theme || 'original';
    root.append(
      el('div', { className: 'vt-settings-container' }, [
        el('header', { className: 'vt-settings-header' }, [
          el('span', { className: 'vt-settings-brand' }, [
            el('span', { className: 'vt-settings-logo', textContent: 'V' }),
            el('span', { className: 'vt-settings-title-wrap' }, [
              el('span', { className: 'vt-settings-title', textContent: 'VacuumTube' }),
              el('span', { className: 'vt-settings-version', textContent: `Version ${VTW.version}` })
            ])
          ]),
          el('span', { className: 'vt-settings-hint', textContent: tr('D-Pad / Pfeile · A / Enter · B / Zurück', 'D-Pad / arrows · A / Enter · B / Back') }),
          el('button', {
            type: 'button', className: 'vt-settings-close vt-focusable',
            dataAction: 'close', ariaLabel: tr('Schließen', 'Close')
          }, [el('span', { textContent: '✕' })])
        ]),
        el('div', { className: 'vt-settings-body' }, [
          el('aside', { className: 'vt-tabs-viewport' }, [tabsRoot]),
          contentRoot
        ])
      ])
    );
    return root;
  };

  const getRoot = () => document.getElementById('vt-settings-inline-root');
  const activePanel = () => getRoot()?.querySelector('.vt-content-panel.vt-panel-active');
  const contentItems = () => [...(activePanel()?.querySelectorAll('.vt-focusable:not(:disabled)') || [])];

  const updateFocus = (area = focusArea) => {
    const root = getRoot();
    if (!root) return;
    focusArea = area;
    root.querySelectorAll('.vt-ui-focused').forEach((node) => node.classList.remove('vt-ui-focused'));

    if (area === 'tabs') {
      const tab = root.querySelector(`.vt-tab[data-panel-index="${panelIndex}"]`);
      tab?.classList.add('vt-ui-focused');
      tab?.scrollIntoView({ block: 'nearest' });
      tab?.focus({ preventScroll: true });
      return;
    }

    if (area === 'close') {
      const close = root.querySelector('.vt-settings-close');
      close?.classList.add('vt-ui-focused');
      close?.focus({ preventScroll: true });
      return;
    }

    const items = contentItems();
    if (!items.length) return updateFocus('tabs');
    itemIndex = Math.max(0, Math.min(itemIndex, items.length - 1));
    const item = items[itemIndex];
    item.classList.add('vt-ui-focused');
    item.scrollIntoView({ block: 'nearest' });
    item.focus({ preventScroll: true });
  };

  const renderPanel = (index = panelIndex) => {
    const root = getRoot();
    const panel = panels[index];
    if (!root || !panel) return;
    const section = root.querySelector(`.vt-content-panel[data-panel="${panel.id}"]`);
    if (!section || panel.dynamic) return;
    section.replaceChildren(createStaticPanel(panel));
  };

  const refreshAllPanels = () => {
    panels.forEach((panel, index) => { if (!panel.dynamic) renderPanel(index); });
    if (panels[panelIndex]?.id === 'diagnostics') refreshDiagnostics();
    updateFocus(focusArea);
  };

  const selectPanel = (index, area = focusArea) => {
    const root = getRoot();
    if (!root) return;
    panelIndex = (index + panels.length) % panels.length;
    itemIndex = 0;
    root.querySelectorAll('.vt-tab').forEach((node, current) => {
      const selected = current === panelIndex;
      node.classList.toggle('vt-tab-selected', selected);
      node.setAttribute('aria-selected', String(selected));
    });
    root.querySelectorAll('.vt-content-panel').forEach((node, current) => node.classList.toggle('vt-panel-active', current === panelIndex));
    if (panels[panelIndex].dynamic) refreshDiagnostics();
    updateFocus(area);
  };

  const cycleChoice = (key, direction = 1) => {
    const values = choiceOptions[key] || [];
    const current = values.findIndex(([value]) => value === effectiveValue(key));
    return values[(current + direction + values.length) % values.length]?.[0];
  };

  const updatePendingIndicator = () => {
    const root = getRoot();
    if (!root) return;
    root.classList.toggle('vt-settings-dirty', hasPendingChanges());
    const hint = root.querySelector('.vt-settings-hint');
    if (hint) hint.textContent = hasPendingChanges()
      ? tr(`${Object.keys(pendingConfig).length} ungespeicherte Änderung(en)`, `${Object.keys(pendingConfig).length} unsaved change(s)`)
      : tr('D-Pad / Pfeile · A / Enter · B / Zurück', 'D-Pad / arrows · A / Enter · B / Back');
  };

  const stageSetting = (key, nextValue) => {
    if (!Object.prototype.hasOwnProperty.call(VTW.defaults, key) || isSettingDisabled(key)) return;
    if (!Object.prototype.hasOwnProperty.call(pendingOriginal, key)) pendingOriginal[key] = VTW.config[key];
    if (nextValue === VTW.config[key]) {
      delete pendingConfig[key];
      delete pendingOriginal[key];
    } else pendingConfig[key] = nextValue;
    if (key === 'settings_theme') {
      const settingsRoot = getRoot();
      if (settingsRoot) settingsRoot.dataset.theme = nextValue || 'original';
    }
    refreshAllPanels();
    updatePendingIndicator();
  };

  const discardPending = () => {
    pendingConfig = {};
    pendingOriginal = {};
    const settingsRoot = getRoot();
    if (settingsRoot) settingsRoot.dataset.theme = VTW.config.settings_theme || 'original';
    refreshAllPanels();
    updatePendingIndicator();
  };

  const commitPending = async () => {
    if (!hasPendingChanges()) return true;
    const patch = { ...pendingConfig };
    const previous = { ...pendingOriginal };
    try {
      await VTW.saveConfig(patch);
      Object.assign(VTW.config, patch);
      pendingConfig = {};
      pendingOriginal = {};
      VTW.emit('config', { ...VTW.config, previous });
      VTW.setStatus('system', { state: 'loading', message: tr('Einstellungen gespeichert – YouTube TV wird neu geladen', 'Settings saved – reloading YouTube TV') });
      updatePendingIndicator();
      setTimeout(() => location.reload(), 250);
      return true;
    } catch (error) {
      VTW.toast(tr('Speichern fehlgeschlagen', 'Save failed'), error.message, { type: 'error', mod: 'system' });
      VTW.log('error', 'settings', tr('Einstellungen konnten nicht gespeichert werden', 'Settings could not be saved'), error);
      return false;
    }
  };

  const closeConfirm = () => {
    confirmVisible = false;
    document.getElementById('vt-settings-save-confirm')?.remove();
  };

  const completeLeave = () => {
    const action = pendingLeaveAction;
    pendingLeaveAction = null;
    closeConfirm();
    if (typeof action === 'function') action();
  };

  const showSaveConfirm = (leaveAction) => {
    if (confirmVisible) return;
    confirmVisible = true;
    pendingLeaveAction = leaveAction;
    const popup = el('div', { id: 'vt-settings-save-confirm', className: 'vt-save-confirm', role: 'dialog', ariaLabel: tr('Änderungen speichern?', 'Save changes?') }, [
      el('div', { className: 'vt-save-confirm-card' }, [
        el('h2', { textContent: tr('Änderungen speichern?', 'Save changes?') }),
        el('p', { textContent: tr('Du hast mehrere VacuumTube-Einstellungen geändert. Speichern und YouTube TV neu laden?', 'You changed multiple VacuumTube settings. Save and reload YouTube TV?') }),
        el('div', { className: 'vt-save-confirm-actions' }, [
          el('button', { type: 'button', className: 'vt-button vt-focusable', dataConfirmAction: 'back', textContent: tr('Zurück', 'Back') }),
          el('button', { type: 'button', className: 'vt-button vt-focusable', dataConfirmAction: 'discard', textContent: tr('Verwerfen', 'Discard') }),
          el('button', { type: 'button', className: 'vt-button vt-focusable vt-primary', dataConfirmAction: 'save', textContent: tr('Speichern', 'Save') })
        ])
      ])
    ]);
    document.body.appendChild(popup);
    const buttons = [...popup.querySelectorAll('button')];
    let selected = buttons.length - 1;
    const focus = () => {
      buttons.forEach((button, index) => button.classList.toggle('vt-ui-focused', index === selected));
      buttons[selected]?.focus({ preventScroll: true });
    };
    const run = async (action) => {
      if (action === 'back') return closeConfirm();
      if (action === 'discard') { discardPending(); return completeLeave(); }
      if (action === 'save' && await commitPending()) completeLeave();
    };
    popup.addEventListener('click', (event) => {
      const button = event.target.closest('[data-confirm-action]');
      if (button) run(button.dataset.confirmAction);
    }, true);
    popup.addEventListener('pointermove', (event) => {
      const button = event.target.closest('button');
      const index = buttons.indexOf(button);
      if (index >= 0) { selected = index; focus(); }
    }, { passive: true });
    popup.addEventListener('keydown', (event) => {
      if (!['ArrowLeft','ArrowRight','Enter',' ','Escape','Backspace'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      if (event.key === 'ArrowLeft') selected = (selected - 1 + buttons.length) % buttons.length;
      else if (event.key === 'ArrowRight') selected = (selected + 1) % buttons.length;
      else if (event.key === 'Escape' || event.key === 'Backspace') return run('back');
      else return run(buttons[selected]?.dataset.confirmAction);
      focus();
    }, true);
    focus();
  };

  const requestLeave = (action) => {
    if (!hasPendingChanges()) return action();
    showSaveConfirm(action);
  };

  const activateItem = (item, direction = 1) => {
    if (!item || item.disabled) return;
    if (item.dataset.action === 'refresh-diagnostics') return refreshDiagnostics(true);
    const key = item.dataset.setting;
    if (!key) return;
    if (item.dataset.type === 'choice') stageSetting(key, cycleChoice(key, direction));
    else stageSetting(key, !Boolean(effectiveValue(key)));
  };

  const formatTime = (timestamp) => {
    try { return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(timestamp); }
    catch { return new Date(timestamp).toLocaleString(); }
  };

  const createInfoRow = (label, value, className = '') => el('div', { className: `vt-diagnostic-row ${className}` }, [
    el('span', { className: 'vt-diagnostic-label', textContent: label }),
    el('span', { className: 'vt-diagnostic-value', textContent: value })
  ]);

  const refreshDiagnostics = async (showToast = false) => {
    const root = getRoot();
    const section = root?.querySelector('.vt-content-panel[data-panel="diagnostics"]');
    if (!section) return;
    const token = ++diagnosticsLoadToken;
    const list = el('div', { className: 'vt-panel-list vt-diagnostics-panel', dataDiagnosticsRoot: 'true' }, [
      createSettingItem('diagnostics_enabled', 0)
    ]);

    if (!VTW.config.diagnostics_enabled) {
      list.appendChild(el('div', { className: 'vt-diagnostics-empty' }, [
        el('strong', { textContent: 'Diagnose ist deaktiviert' }),
        el('span', { textContent: 'Es werden keine neuen Protokolle gespeichert. Vorhandene VacuumTube-Protokolle wurden gelöscht.' })
      ]));
      section.replaceChildren(list);
      updateFocus(focusArea);
      return;
    }

    list.appendChild(el('button', {
      type: 'button', className: 'vt-button vt-focusable', dataAction: 'refresh-diagnostics', dataItemIndex: 1
    }, [el('span', { textContent: 'Diagnose aktualisieren' }), el('span', { textContent: '↻' })]));
    list.appendChild(el('h2', { className: 'vt-panel-heading', textContent: 'Systemstatus' }));
    const local = VTW.createDiagnostics();
    list.append(
      createInfoRow('VacuumTube', local.extension),
      createInfoRow('YouTube-Client', local.youtubeClient),
      createInfoRow('Laufzeit', `${local.uptimeSeconds} Sekunden`),
      createInfoRow('Speicherort', 'Erweiterungsspeicher auf diesem Gerät'),
      createInfoRow('Aufbewahrung', 'Automatische Löschung nach 3 Tagen')
    );

    const statusGrid = el('div', { className: 'vt-status-grid' });
    for (const [id, status] of Object.entries(local.statuses)) {
      statusGrid.appendChild(el('div', { className: 'vt-status-card' }, [
        el('span', { className: 'vt-status-card-name', textContent: id.replace('_', ' ') }),
        el('span', { className: `vt-setting-status vt-status-${status.state}`, textContent: statusLabels[status.state] || status.state }),
        el('span', { className: 'vt-status-card-message', textContent: status.message || 'Bereit' })
      ]));
    }
    list.appendChild(statusGrid);
    list.appendChild(el('h2', { className: 'vt-panel-heading', textContent: 'Letzte Protokolle' }));
    list.appendChild(el('div', { className: 'vt-diagnostics-loading', textContent: 'Protokolle werden geladen …' }));
    section.replaceChildren(list);
    updateFocus(focusArea);

    try {
      const stored = await VTW.getStoredDiagnostics();
      if (token !== diagnosticsLoadToken || !section.isConnected) return;
      list.querySelector('.vt-diagnostics-loading')?.remove();
      const logs = Array.isArray(stored?.logs) ? stored.logs : [];
      if (!logs.length) {
        list.appendChild(el('div', { className: 'vt-diagnostics-empty' }, [
          el('span', { textContent: 'Noch keine Diagnoseeinträge vorhanden.' })
        ]));
      } else {
        const logList = el('div', { className: 'vt-log-list' });
        for (const entry of logs.slice(0, 60)) {
          logList.appendChild(el('div', { className: `vt-log-entry vt-log-${entry.level || 'info'}` }, [
            el('span', { className: 'vt-log-meta', textContent: `${formatTime(entry.timestamp)} · ${entry.module}` }),
            el('span', { className: 'vt-log-message', textContent: entry.message }),
            entry.details ? el('span', {
              className: 'vt-log-details',
              textContent: typeof entry.details === 'string' ? entry.details : JSON.stringify(entry.details)
            }) : null
          ]));
        }
        list.appendChild(logList);
      }
      if (showToast) VTW.toast('Diagnose', 'Status und Protokolle aktualisiert', { type: 'success', mod: 'diagnostics' });
    } catch (error) {
      if (token !== diagnosticsLoadToken) return;
      list.querySelector('.vt-diagnostics-loading')?.remove();
      list.appendChild(el('div', { className: 'vt-diagnostics-empty vt-diagnostics-error' }, [
        el('strong', { textContent: 'Protokolle konnten nicht geladen werden' }),
        el('span', { textContent: error.message })
      ]));
    }
  };

  const cleanCloneIds = (node) => {
    if (!(node instanceof Element)) return;
    node.removeAttribute('id');
    node.removeAttribute('aria-controls');
    node.removeAttribute('aria-labelledby');
    node.removeAttribute('data-vtw-inline-hidden');
    for (const child of node.querySelectorAll('[id],[aria-controls],[aria-labelledby]')) {
      child.removeAttribute('id');
      child.removeAttribute('aria-controls');
      child.removeAttribute('aria-labelledby');
    }
  };

  const textOf = (node) => (node?.innerText || node?.textContent || '').replace(/\s+/g, ' ').trim();
  const isVisible = (node) => {
    if (!(node instanceof Element)) return false;
    const rect = node.getBoundingClientRect?.();
    const style = getComputedStyle(node);
    return Boolean(rect && rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0);
  };

  const SETTINGS_LABEL = /(einstellungen|settings|elterncode|parent code|sprache|language|eingeschränkter modus|restricted mode|premium-mitglied|premium member|tv-code|connected devices|verbundene geräte|käufe und mitgliedschaften|purchases and memberships)/i;
  const ROW_SELECTOR = [
    'ytlr-setting-category-renderer', 'ytlr-setting-item-renderer', 'ytlr-settings-item-renderer',
    'ytlr-setting-action-renderer', 'ytlr-setting-boolean-renderer',
    'button', '[role="button"]', '[role="menuitem"]', '[tabindex="0"]', 'a'
  ].join(',');

  const isSettingsPage = () => {
    if (document.querySelector('ytlr-settings-renderer,ytlr-setting-category-collection-renderer,ytlr-setting-category-renderer')) return true;
    const route = `${location.pathname || ''} ${location.hash || ''}`;
    if (/settings|einstellungen/i.test(route)) return true;
    const visibleLabels = [...document.querySelectorAll(ROW_SELECTOR)]
      .filter(isVisible)
      .map(textOf)
      .filter((text) => SETTINGS_LABEL.test(text));
    return visibleLabels.length >= 3;
  };

  const findTextControl = () => {
    const exactLabels = /^(premium-mitglied werden|premium member|käufe und mitgliedschaften|purchases and memberships|nächstes video(?: automatisch)?|autoplay|eingeschränkter modus|restricted mode|elterncode|parent code|per wlan verbinden|connect with wi-fi|per tv-code verbinden|link with tv code|verbundene geräte|connected devices|sprache|language)$/i;
    const all = [...document.querySelectorAll(ROW_SELECTOR)];
    return all.find((node) => isVisible(node) && exactLabels.test(textOf(node).replace(/\.{3,}$/, '').trim())) ||
      all.find((node) => isVisible(node) && SETTINGS_LABEL.test(textOf(node))) || null;
  };

  const scoreSettingsList = (candidate) => {
    if (!(candidate instanceof HTMLElement) || !isVisible(candidate)) return null;
    const rect = candidate.getBoundingClientRect();
    const children = [...candidate.children].filter((child) => child instanceof HTMLElement && isVisible(child));
    const rows = children.filter((child) => {
      const text = textOf(child);
      const box = child.getBoundingClientRect?.();
      return box && box.height >= 14 && box.height <= 180 && text.length > 0 && (SETTINGS_LABEL.test(text) || child.querySelector?.(ROW_SELECTOR));
    });
    if (rows.length < 3) return null;
    const known = rows.filter((row) => SETTINGS_LABEL.test(textOf(row))).length;
    const vertical = rows.length < 2 || rows.slice(1).every((row, index) => row.getBoundingClientRect().top >= rows[index].getBoundingClientRect().top - 2);
    if (!vertical) return null;
    return { candidate, rows, rect, score: known * 20 + rows.length * 4 - Math.max(0, rect.width - 700) / 20 };
  };

  const findNativeSettingsColumns = () => {
    if (!isSettingsPage()) return null;
    const anchor = findTextControl();
    const listCandidates = new Set();
    if (anchor) {
      let node = anchor;
      for (let depth = 0; node?.parentElement && depth < 10; depth += 1, node = node.parentElement) listCandidates.add(node.parentElement);
    }
    for (const node of document.querySelectorAll([
      'ytlr-setting-category-collection-renderer', 'ytlr-settings-renderer [role="list"]',
      '[class*="settings" i] [role="list"]', '[class*="setting" i] [class*="list" i]'
    ].join(','))) listCandidates.add(node);

    const scored = [...listCandidates].map(scoreSettingsList).filter(Boolean).sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best) return null;
    const navigation = best.candidate;
    const navRect = best.rect;
    const anchorRow = best.rows.find((row) => SETTINGS_LABEL.test(textOf(row))) || best.rows[0];
    const anchorControl = anchorRow.matches(ROW_SELECTOR) ? anchorRow : anchorRow.querySelector(ROW_SELECTOR) || anchorRow;

    let layout = navigation.parentElement;
    let content = null;
    for (let depth = 0; layout && depth < 8; depth += 1, layout = layout.parentElement) {
      const siblings = [...layout.children].filter((child) => child instanceof HTMLElement && child !== navigation && isVisible(child));
      content = siblings
        .map((child) => ({ child, rect: child.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width > Math.max(160, navRect.width * .65) && rect.height > 80 && rect.left >= navRect.right - 30)
        .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)[0]?.child || null;
      if (content) break;
    }
    if (!content) {
      content = [...document.querySelectorAll('main,[role="main"],ytlr-settings-renderer,[class*="settings-content" i],[class*="detail" i]')]
        .filter((node) => node !== navigation && isVisible(node))
        .map((node) => ({ node, rect: node.getBoundingClientRect() }))
        .filter(({ rect }) => rect.left >= navRect.right - 30 && rect.width > Math.max(160, navRect.width * .65))
        .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)[0]?.node || null;
    }
    return content ? { navigation, content, anchor: anchorControl, rows: best.rows } : null;
  };

  // Xbox uses a single DOM entry inside the visible native settings list.
  // Generic settings-model mutation is intentionally disabled because some
  // Leanback builds reuse those collections for the main guide and would create
  // a second Settings destination.

  const makeNativeSettingsEntry = (anchor) => {
    const clickable = anchor.closest('button,[role="button"],[tabindex="0"],a') || anchor;
    const entry = clickable.cloneNode(true);
    cleanCloneIds(entry);
    entry.id = 'vtw-native-settings-entry';
    entry.dataset.vtwNativeSettingsEntry = 'true';
    entry.removeAttribute('href');
    entry.removeAttribute('aria-selected');
    entry.setAttribute('role', 'button');
    entry.setAttribute('tabindex', '0');
    entry.setAttribute('aria-label', tr('VacuumTube-Einstellungen öffnen', 'Open VacuumTube settings'));

    const textNodes = [];
    const walker = document.createTreeWalker(entry, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) if (walker.currentNode.nodeValue.trim()) textNodes.push(walker.currentNode);
    if (textNodes.length) {
      textNodes[0].nodeValue = 'VacuumTube';
      for (const node of textNodes.slice(1)) node.nodeValue = '';
    } else {
      entry.appendChild(el('span', { textContent: 'VacuumTube' }));
    }
    entry.addEventListener('click', (event) => {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      showOverlay();
    }, true);
    entry.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault(); event.stopPropagation();
      showOverlay();
    }, true);
    return entry;
  };

  const findNativeSettingsList = (anchor) => {
    const clickableSelector = 'button,[role="button"],[tabindex="0"],a';
    let row = anchor.closest(clickableSelector) || anchor;
    let node = row;
    for (let depth = 0; node?.parentElement && depth < 8; depth += 1, node = node.parentElement) {
      const parent = node.parentElement;
      const siblings = [...parent.children].filter((child) => child instanceof HTMLElement);
      const rows = siblings.filter((child) => {
        const rect = child.getBoundingClientRect?.();
        const control = child.matches(clickableSelector) ? child : child.querySelector(clickableSelector);
        const text = textOf(child);
        return control && rect && rect.width > 80 && rect.height > 18 && rect.height < 150 && text.length > 0;
      });
      if (rows.length >= 4) {
        const nativeRow = siblings.find((child) => child === node || child.contains(anchor)) || node;
        return { list: parent, row: nativeRow };
      }
    }
    return null;
  };

  const ensureNativeSettingsEntry = () => {
    const columns = findNativeSettingsColumns();
    if (!columns) return false;
    const placement = findNativeSettingsList(columns.anchor);
    if (!placement?.list || !placement.row) return false;

    const existing = document.getElementById('vtw-native-settings-entry');
    if (existing?.isConnected && placement.list.contains(existing)) return true;
    existing?.remove();

    const renderedVacuumRow = [...placement.list.children].find((child) => /^VacuumTube(?:\s|$)/i.test(textOf(child)));
    if (renderedVacuumRow) {
      const renderedControl = renderedVacuumRow.matches(ROW_SELECTOR) ? renderedVacuumRow : renderedVacuumRow.querySelector(ROW_SELECTOR) || renderedVacuumRow;
      renderedControl.id = 'vtw-native-settings-entry';
      renderedControl.dataset.vtwNativeSettingsEntry = 'true';
      if (!renderedControl.dataset.vtwSettingsBound) {
        renderedControl.dataset.vtwSettingsBound = 'true';
        renderedControl.addEventListener('click', (event) => {
          event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
          showOverlay();
        }, true);
      }
      return true;
    }

    const sourceControl = placement.row.matches('button,[role="button"],[tabindex="0"],a')
      ? placement.row
      : placement.row.querySelector('button,[role="button"],[tabindex="0"],a') || columns.anchor;
    const entryControl = makeNativeSettingsEntry(sourceControl);
    let entryRow = entryControl;
    if (placement.row !== sourceControl && placement.row.contains(sourceControl)) {
      entryRow = placement.row.cloneNode(true);
      cleanCloneIds(entryRow);
      const clonedControl = entryRow.matches('button,[role="button"],[tabindex="0"],a')
        ? entryRow
        : entryRow.querySelector('button,[role="button"],[tabindex="0"],a');
      if (clonedControl && clonedControl !== entryRow) clonedControl.replaceWith(entryControl);
      else entryRow = entryControl;
    }
    if (entryRow !== entryControl) entryRow.dataset.vtwNativeSettingsRow = 'true';
    placement.list.appendChild(entryRow);
    return document.getElementById('vtw-native-settings-entry')?.isConnected === true;
  };

  const findSettingsHost = () => {
    const marker = document.querySelector('[data-vtw-settings-host]');
    if (marker?.isConnected) return marker;
    const candidates = [
      ...document.querySelectorAll('ytlr-settings-renderer, ytlr-setting-category-collection-renderer, [class*="settings" i], [id*="settings" i]')
    ];
    for (const candidate of candidates) {
      const rect = candidate.getBoundingClientRect?.();
      if (!rect || rect.width < 220 || rect.height < 160) continue;
      const host = candidate.closest('ytlr-settings-renderer,[role="main"],[class*="settings" i],[id*="settings" i]') || candidate;
      host.dataset.vtwSettingsHost = 'true';
      return host;
    }
    return null;
  };

  const mountInsideSettings = () => {
    const root = getRoot();
    const columns = findNativeSettingsColumns();
    const host = columns?.content || findSettingsHost();
    if (!root || !host) return false;
    if (root.parentElement !== host) host.appendChild(root);
    for (const child of [...host.children]) {
      if (child === root) continue;
      if (!child.hasAttribute('data-vtw-inline-hidden')) {
        child.dataset.vtwInlineHidden = child.style.display || '';
        child.style.display = 'none';
      }
    }
    host.dataset.vtwSettingsDetailHost = 'true';
    host.classList.add('vtw-inline-settings-host');
    document.getElementById('vtw-native-settings-entry')?.setAttribute('aria-selected', 'true');
    document.getElementById('vtw-native-settings-entry')?.classList.add('vtw-native-settings-selected');
    return true;
  };

  const restoreSettingsHost = () => {
    const root = getRoot();
    const host = root?.parentElement;
    if (!host) return;
    for (const child of [...host.children]) {
      if (child === root || !child.hasAttribute('data-vtw-inline-hidden')) continue;
      child.style.display = child.dataset.vtwInlineHidden || '';
      child.removeAttribute('data-vtw-inline-hidden');
    }
    host.classList.remove('vtw-inline-settings-host');
    host.removeAttribute('data-vtw-settings-detail-host');
    const entry = document.getElementById('vtw-native-settings-entry');
    entry?.removeAttribute('aria-selected');
    entry?.classList.remove('vtw-native-settings-selected');
  };

  const showOverlay = (panelId) => {
    const root = getRoot();
    if (!root || window.ytcfg?.data_?.INNERTUBE_CLIENT_NAME === 'TVHTML5_FOR_KIDS') return;
    if (!mountInsideSettings()) {
      VTW.toast('VacuumTube', 'Öffne zuerst die YouTube-TV-Einstellungen.', { type: 'warning', mod: 'system' });
      return;
    }
    visible = true;
    root.classList.remove('vt-settings-hidden');
    document.documentElement.classList.add('vt-settings-open');
    const index = panels.findIndex((panel) => panel.id === panelId);
    if (index >= 0) panelIndex = index;
    selectPanel(panelIndex, 'content');
    root.focus();
    VTW.emit('settings-visibility', true);
  };

  const performHideOverlay = () => {
    visible = false;
    getRoot()?.classList.add('vt-settings-hidden');
    restoreSettingsHost();
    document.documentElement.classList.remove('vt-settings-open');
    VTW.emit('settings-visibility', false);
  };

  const hideOverlay = () => requestLeave(performHideOverlay);

  VTW.openSettingsOverlay = () => showOverlay();
  VTW.openSettingsPanel = (panelId) => showOverlay(panelId);
  VTW.toggleSettingsOverlay = () => visible ? hideOverlay() : showOverlay();
  VTW.isSettingsOverlayVisible = () => visible;

  VTW.addCommandInputModifier?.((command) => {
    const containsOpenCommand = (value, seen = new WeakSet(), depth = 0) => {
      if (!value || typeof value !== 'object' || seen.has(value) || depth > 8) return false;
      seen.add(value);
      if (value.vtwOpenSettingsCommand === true || value.vtConfigOption === 'open-settings') return true;
      return Object.values(value).some((item) => containsOpenCommand(item, seen, depth + 1));
    };
    if (!containsOpenCommand(command)) return command;
    queueMicrotask(() => showOverlay());
    return false;
  });

  const handleKey = (event) => {
    if (confirmVisible) return false;
    if (!visible) return false;
    const key = event.key;
    const supported = ['Escape', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Tab', 'Home', 'End', 'PageUp', 'PageDown'];
    if (!supported.includes(key)) return false;
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();

    if (key === 'Escape' || key === 'Backspace') { hideOverlay(); return true; }
    if (key === 'PageUp') { selectPanel(panelIndex - 1, focusArea); return true; }
    if (key === 'PageDown') { selectPanel(panelIndex + 1, focusArea); return true; }
    if (key === 'Tab') { updateFocus(focusArea === 'tabs' ? 'content' : 'tabs'); return true; }
    if (key === 'Home') {
      if (focusArea === 'tabs') selectPanel(0, 'tabs');
      else { itemIndex = 0; updateFocus('content'); }
      return true;
    }
    if (key === 'End') {
      if (focusArea === 'tabs') selectPanel(panels.length - 1, 'tabs');
      else { itemIndex = Math.max(0, contentItems().length - 1); updateFocus('content'); }
      return true;
    }
    if (key === 'ArrowLeft') {
      if (focusArea === 'close') updateFocus('content');
      else updateFocus('tabs');
      return true;
    }
    if (key === 'ArrowRight') {
      if (focusArea === 'tabs') updateFocus('content');
      else if (focusArea === 'content') {
        const item = contentItems()[itemIndex];
        if (item?.dataset.type === 'choice') activateItem(item, 1);
        else updateFocus('close');
      }
      return true;
    }
    if (key === 'ArrowUp') {
      if (focusArea === 'tabs') selectPanel(panelIndex - 1, 'tabs');
      else if (focusArea === 'content') { itemIndex = Math.max(0, itemIndex - 1); updateFocus('content'); }
      else updateFocus('content');
      return true;
    }
    if (key === 'ArrowDown') {
      if (focusArea === 'tabs') selectPanel(panelIndex + 1, 'tabs');
      else if (focusArea === 'content') { itemIndex = Math.min(contentItems().length - 1, itemIndex + 1); updateFocus('content'); }
      else updateFocus('content');
      return true;
    }
    if (key === 'Enter' || key === ' ') {
      if (focusArea === 'close') hideOverlay();
      else if (focusArea === 'tabs') updateFocus('content');
      else activateItem(contentItems()[itemIndex]);
      return true;
    }
    return false;
  };
  VTW.handleSettingsInput = handleKey;

  const init = () => {
    if (getRoot() || !document.body) return;
    const root = createOverlay();
    document.body.appendChild(root);

    root.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      const tab = event.target.closest('.vt-tab');
      if (tab) {
        panelIndex = Number(tab.dataset.panelIndex);
        focusArea = 'tabs';
        updateFocus('tabs');
      }
      const item = event.target.closest('.vt-content-panel .vt-focusable:not(:disabled)');
      if (item) {
        const items = contentItems();
        itemIndex = Math.max(0, items.indexOf(item));
        focusArea = 'content';
        updateFocus('content');
      }
    }, true);

    root.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (event.target.closest('[data-action="close"]')) return hideOverlay();
      const tab = event.target.closest('.vt-tab');
      if (tab) return selectPanel(Number(tab.dataset.panelIndex), 'content');
      const item = event.target.closest('.vt-content-panel .vt-focusable:not(:disabled)');
      if (item) activateItem(item);
    }, true);

    root.addEventListener('mousemove', (event) => {
      const tab = event.target.closest('.vt-tab');
      if (tab) {
        selectPanel(Number(tab.dataset.panelIndex), 'tabs');
        return;
      }
      const item = event.target.closest('.vt-content-panel .vt-focusable:not(:disabled)');
      if (item) {
        itemIndex = Math.max(0, contentItems().indexOf(item));
        updateFocus('content');
      }
    }, { passive: true });

    refreshAllPanels();
    ensureNativeSettingsEntry();
    const nativeObserver = new MutationObserver(() => ensureNativeSettingsEntry());
    nativeObserver.observe(document.documentElement, { childList: true, subtree: true });
    setInterval(ensureNativeSettingsEntry, 1500);
  };

  document.addEventListener('click', (event) => {
    if (!visible || confirmVisible || !hasPendingChanges()) return;
    const root = getRoot();
    if (root?.contains(event.target)) return;
    const target = event.target.closest('a,button,[role="button"],[tabindex]');
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    requestLeave(() => {
      performHideOverlay();
      target.click();
    });
  }, true);

  window.addEventListener('beforeunload', (event) => {
    if (!hasPendingChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  VTW.waitFor(() => document.body).then(init).catch(() => {});
  VTW.on('config', refreshAllPanels);
  VTW.on('status', () => {
    if (visible) refreshAllPanels();
  });

  document.addEventListener('keydown', (event) => {
    if (globalThis.__VTW_XBOX_NATIVE__ && !event.__vtwXbox && !event.__vtwXboxInternal) return;
    if (event.ctrlKey && !event.shiftKey && String(event.key || '').toLowerCase() === 'o') {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      VTW.toggleSettingsOverlay();
      return;
    }
    handleKey(event);
  }, true);

  document.addEventListener('keyup', (event) => {
    if (globalThis.__VTW_XBOX_NATIVE__ && !event.__vtwXbox && !event.__vtwXboxInternal) return;
    if (!visible) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }, true);

  // VacuumTube is intentionally injected only through the visible DOM of the
  // already-open YouTube TV settings page. Do not modify generic YouTube
  // settings JSON collections: those collections are reused by some TV builds
  // for the main navigation and can otherwise create a second Settings entry.
  // The DOM fallback above creates exactly one `VacuumTube` row in the native
  // settings list and mounts the details in the original right-hand pane.

})();
