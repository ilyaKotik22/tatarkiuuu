import { Telegraf } from "telegraf";
import { v4 as uuidv4 } from "uuid";




// --- Музыкальная библиотека (20 песен) ---
class MusicLibrary {
  constructor() {
    this.songs = this.loadSongs();
  }
  loadSongs() {
    return [...Array(20)].map((_, i) => ({
      id: i + 1,
      title: `Песня ${i + 1 } looong name very vert`,
      previewFile: `previews/preview${i + 1}.mp3`,
      fullFile: `full/full${i + 1}.mp3`,
    }));
  }
//   getRandomSong() {
//     const idx = Math.floor(Math.random() * this.songs.length);
//     return this.songs[idx];
//   }
}


// --- Игрок ---
class Player {
  constructor(user) {
    this.id = user.id;
    this.username = user.username || user.first_name || "Игрок";
    this.selectedSongs = new Set();
    this.board = [];
    this.hasChosenInRound = false; // Добавляем флаг для текущего раунда
  }
  
  setBoard(songs) {
    this.board = songs;
  }
  
  chooseSong(songId) {
    if (this.selectedSongs.has(songId)) return false;
    this.selectedSongs.add(songId);
    return true;
  }
  
  resetRoundChoice() {
    this.hasChosenInRound = false;
  }

  checkWin() {
    // Доска — массив из 9 песен, 3х3
    // selectedSongs — set с id выбранных песен

    // Проверить все 3 горизонтали и 3 вертикали
    for (let i = 0; i < 3; i++) {
      // Горизонталь i: индексы i*3, i*3+1, i*3+2
      const horizontalWin = [0,1,2].every(j => this.selectedSongs.has(this.board[i*3 + j].id));
      if (horizontalWin) return true;

      // Вертикаль i: индексы i, i+3, i+6
      const verticalWin = [0,1,2].every(j => this.selectedSongs.has(this.board[i + j*3].id));
      if (verticalWin) return true;
    }
    return false;
  }
}



// --- Лобби ---
class Lobby {
  constructor(hostUser) {
    this.id = uuidv4().slice(0, 8).toUpperCase();
    this.hostId = hostUser.id;
    this.players = new Map();
    this.gameStarted = false;
    this.currentRound = 0;
    this.currentSong = null;
    this.library = new MusicLibrary();
    this.playedSongs = new Set(); // Добавляем отслеживание проигранных песен
    this.availableSongs = [...this.library.songs]; // Копия всех песен
    this.roundSelections = new Map();
    this.addPlayer(hostUser);
  }

   allPlayersChosen() {
    return this.roundSelections.size === (this.players.size - 1);
  }

  resetRoundState() {
    this.roundSelections.clear();
    for (const p of this.players.values()) p.resetRoundChoice();
  }

   addPlayer(user) {
    if (this.players.has(user.id)) return null;
    const player = new Player(user);
    const playerSongs = [...this.library.songs]
      .sort(() => 0.5 - Math.random())
      .slice(0, 9);
    player.setBoard(playerSongs);
    this.players.set(user.id, player);
    return player;
  }
  getNextSong() {
    // Фильтруем неиспользованные песни
    const unplayedSongs = this.availableSongs.filter(song => !this.playedSongs.has(song.id));
    
    if (unplayedSongs.length === 0) {
      return null; // Все песни закончились
    }
    
    // Выбираем случайную из неиспользованных
    const randomIndex = Math.floor(Math.random() * unplayedSongs.length);
    const selectedSong = unplayedSongs[randomIndex];
    
    // Помечаем как использованную
    this.playedSongs.add(selectedSong.id);
    
    return selectedSong;
  }

  startGame() {
    if (this.players.size < 2) return false;
    this.gameStarted = true;
    this.currentRound = 1;
    this.currentSong = this.getNextSong(); // Используем новый метод
    // Сбрасываем флаги выбора для всех игроков при старте игры
    for (const player of this.players.values()) {
      player.resetRoundChoice();
    }
    return true;
  }

  isLastRound() {
    // Игра заканчивается, когда нет больше неиспользованных песен
    return this.playedSongs.size >= this.library.songs.length;
  }

  nextRound() {
  if (this.isLastRound()) return false;
  this.currentRound++;
  this.currentSong = this.getNextSong();
  this.resetRoundState();               // добавлено
  return true;
}
}



// --- Бот ---
class MusicLotoBot {
  constructor(token) {
    this.telegraf = new Telegraf(token);
    this.lobbies = new Map();

    // /start с payload
    this.telegraf.start(async (ctx) => {
      const payload = ctx.startPayload || "";
      if (payload.startsWith("LOBBY_")) {
        const lobbyId = payload.split("_")[1];
        await this.joinLobby(ctx, lobbyId);
      } else {
        await this.showWelcome(ctx);
      }
    });

    // Кнопки
    this.telegraf.on("callback_query", async (ctx) => {
      const data = ctx.callbackQuery.data;
      if (data.startsWith("select_"))        return this.handleSongSelection(ctx, data.slice(7));
    if (data === "start_game")            return this.handleStartGame(ctx);
    if (data === "next_round")            return this.handleNextRound(ctx);
    if (data === "reveal_answer")         return this.handleReveal(ctx); 
    });

    // Создание лобби
    this.telegraf.command("createlobby", async (ctx) => {
      await this.createLobby(ctx);
    });

    // Новая команда /nextround для переключения раунда хостом
    this.telegraf.command("nextround", async (ctx) => {
      const hostId = ctx.message.from.id;
      const lobby = this.findLobbyByHost(hostId);
      if (!lobby) {
        await ctx.reply("Вы не являетесь хостом активного лобби.");
        return;
      }
      if (lobby.isLastRound()) {
        await ctx.reply("Все раунды пройдены. Игра окончена.");
        return;
      }
      if (lobby.nextRound()) {
        await this.sendRoundMessages(lobby);
      }
    });

    // Запуск
    this.telegraf.launch();
  }



  async showWelcome(ctx) {
    await ctx.reply(
      "Добро пожаловать в музыкальное лото! Для создания лобби нажмите /createlobby"
    );
  }

  async createLobby(ctx) {
    const hostUser = ctx.message.from;
    const lobby = new Lobby(hostUser);
    this.lobbies.set(lobby.id, lobby);

    const botUsername = (await this.telegraf.telegram.getMe()).username;
    const joinLink = `https://t.me/${botUsername}?start=LOBBY_${lobby.id}`;
    await ctx.reply(
      `Лобби создано! Ссылка для приглашения:\n${joinLink}\nЖдем игроков...`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Начать игру", callback_data: "start_game" }],
            [{ text: "Следующий раунд ▶️", callback_data: "next_round" }],
          ],
        },
      }
    );
  }

  async joinLobby(ctx, lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return ctx.reply("Лобби не найдено или игра уже началась.");
    if (lobby.gameStarted) return ctx.reply("Игра уже началась.");

    const player = lobby.addPlayer(ctx.message.from);
    if (!player) return ctx.reply("Вы уже в лобби.");

    // Уведомить хоста о новом игроке
    await this.telegraf.telegram.sendMessage(
      lobby.hostId,
      `Игрок ${player.username} подключился. Сейчас в лобби ${lobby.players.size} игроков.`
    );

    await ctx.reply(
      `Вы присоединились к лобби ${lobbyId}. Ожидайте начала игры.`
    );
  }

  findLobbyByHost(hostId) {
    for (const lobby of this.lobbies.values())
      if (lobby.hostId === hostId) return lobby;
    return null;
  }

  findLobbyByPlayer(playerId) {
    for (const lobby of this.lobbies.values())
      if (lobby.players.has(playerId)) return lobby;
    return null;
  }

  async handleStartGame(ctx) {
    const hostId = ctx.callbackQuery.from.id;
    const lobby = this.findLobbyByHost(hostId);
    if (!lobby) return;

    if (!lobby.startGame()) {
      await ctx.answerCbQuery("Нужно минимум 2 игрока");
      return;
    }
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await this.sendRoundMessages(lobby);
  }

async sendRoundMessages(lobby) {
  // Сообщение ведущему с отрывком
  await this.telegraf.telegram.sendMessage(
    lobby.hostId,
    `🎵 Раунд ${lobby.currentRound} 🎵\n` +
    `Проиграйте этот отрывок:\n` +
    `📁 ${lobby.currentSong.previewFile}\n` +
    `🎶 Играет: "${lobby.currentSong.title}"`
  );

  // Для игроков — клавиатура с их доской И информация о песне
  for (const player of lobby.players.values()) {
    if (player.id === lobby.hostId) continue; // Пропускаем хоста
    
    const keyboard = generateKeyboard(player.board, player.selectedSongs);
    await this.telegraf.telegram.sendMessage(
      player.id,
      `🎵 Раунд ${lobby.currentRound} 🎵\n` +
      `🎶 Сейчас играет песня...\n` +
      `Выберите песню из вашей доски:`,
      { reply_markup: keyboard }
    );
  }
}

  async handleSongSelection(ctx, songIdStr) {
  const userId = ctx.callbackQuery.from.id;
  const songId = Number(songIdStr);
  
  const lobby = this.findLobbyByPlayer(userId);
  if (!lobby) {
    await ctx.answerCbQuery("Вы не в игре");
    return;
  }
  
  if (userId === lobby.hostId) {
    await ctx.answerCbQuery("Создатель лобби не может выбирать песни");
    return;
  }
  
  const player = lobby.players.get(userId);
  if (!player) {
    await ctx.answerCbQuery("Игрок не найден в лобби");
    return;
  }

  // Проверяем, не сделал ли игрок уже выбор в этом раунде
  if (player.hasChosenInRound) {
    await ctx.answerCbQuery("Вы уже сделали выбор в этом раунде");
    return;
  }

  // Отмечаем, что игрок сделал выбор в этом раунде
  player.hasChosenInRound = true;

  // Удаляем клавиатуру независимо от правильности ответа
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });

  lobby.roundSelections.set(userId, songId);         // фиксируем выбор

  await ctx.answerCbQuery("Выбор принят. Ожидайте раскрытия!");

  // Когда выбрали все — уведомляем ведущего
  if (lobby.allPlayersChosen()) {
    await this.telegraf.telegram.sendMessage(
      lobby.hostId,
      `✅ Все игроки сделали выбор в раунде ${lobby.currentRound}.`,
      { reply_markup: { inline_keyboard: [
          [{ text: "Показать оригинал 🎧", callback_data: "reveal_answer" }]
        ]}}
    );
  }
}


    // ░░░ ➍  Логика раскрытия ответа
async handleReveal(ctx) {
  const hostId = ctx.callbackQuery.from.id;
  const lobby  = this.findLobbyByHost(hostId);
  if (!lobby) return;

  // убираем кнопку
  await ctx.editMessageReplyMarkup({inline_keyboard: []});

  // Готовим текст для каждого игрока
  for (const [id, player] of lobby.players) {
    if (id === hostId) continue;                    // хосту ниже отправим отдельно

    const chosenId = lobby.roundSelections.get(id);
    const correct  = (chosenId === lobby.currentSong.id);
    const mark     = correct ? "✅ Верно!" : "❌ Мимо";

    await this.telegraf.telegram.sendAudio(
      id,
      { source: lobby.currentSong.fullFile },       // отправляем оригинал
      { caption: `${mark}\nОригинал: «${lobby.currentSong.title}»`}
    );
  }

  // Ведущему — сводка
  let summary = "🎤 Итоги раунда:\n";
  for (const [id, songId] of lobby.roundSelections) {
    const p = lobby.players.get(id);
    const res = songId === lobby.currentSong.id ? "угадал ✅" : "не угадал ❌";
    summary += `• ${p.username} — ${res}\n`;
  }
  await this.telegraf.telegram.sendMessage(hostId, summary);

  // Переходим к следующему раунду
  if (lobby.nextRound()) {
    await this.sendRoundMessages(lobby);
  } else {
    await this.telegraf.telegram.sendMessage(
      hostId, "🎉 Все песни сыграны. Игра окончена!"
    );
  }
}



  async handleNextRound(ctx) {
  const hostId = ctx.callbackQuery.from.id;
  const lobby = this.findLobbyByHost(hostId);
  if (!lobby) return;

  if (lobby.isLastRound()) {
    await ctx.answerCbQuery("Все песни сыграны. Игра окончена.");
    
    // Отправляем финальное сообщение всем игрокам
    for (const player of lobby.players.values()) {
      await this.telegraf.telegram.sendMessage(
        player.id, 
        `🎵 Игра окончена! 🎵\nВсе песни были сыграны.\nСпасибо за участие!`
      );
    }
    return;
  }

  if (lobby.nextRound()) {
    await this.sendRoundMessages(lobby);
    await ctx.answerCbQuery(`Переход к раунду ${lobby.currentRound}`);
  } else {
    await ctx.answerCbQuery("Не удалось перейти к следующему раунду");
  }
}
}

// Вспомогательная функция для генерации inline-клавиатуры 3x3
function generateKeyboard(boardSongs, selectedSongs) {
  return {
    inline_keyboard: [...Array(3)].map((_, i) =>
      [...Array(3)].map((_, j) => {
        const song = boardSongs[i * 3 + j];
        const text = selectedSongs.has(song.id)
          ? `✅${song.title} `
          : song.title;
        return { text, callback_data: `select_${song.id}` };
      })
    ),
  };
}

// Запуск бота
const token = "8346415634:AAF_Y5nbdfCZzXx4LkZNd92CwZnjjfDSYO4"; // Лучше через process.env.TELEGRAM_BOT_TOKEN
new MusicLotoBot(token);
