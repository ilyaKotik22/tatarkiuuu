import { Telegraf } from "telegraf";
import { v4 as uuidv4 } from "uuid";

const mapSongs = new Map([
  [1, "ajjfara-ak-kaen-minus-cup.mp3"],
  [2, "KHaniya_arkhi_-_Kyshky_chiya_48018885 -minus.mp3"],
  [3, "kalepina"],
  [4, "kalepina"],
  [5, "kalepina"],
  [6, "kalepina"],
  [7, "kalepina"],
  [8, "kalepina"],
  [9, "kalepina"],
  [10, "kalepina"],
  [11, "kalepina"],
  [12, "kalepina"],
  [13, "kalepina"],
  [14, "kalepina"],
  [15, "kalepina"],
  [16, "kalepina"],
  [17, "kalepina"],
  [18, "kalepina"],
  [19, "kalepina"],
  [20, "kalepina"],
])


class MusicLibrary {
  constructor() {
    this.songs = this.loadSongs();
  }
  loadSongs() {
    return [...Array(20)].map((_, i) => ({
      id: i + 1,
      title: `Песня ${i + 1 } looong name very vert`,
      previewFile: `previews/${i + 1}.mp3`,
      previewHardFile: `previewsminus/${i + 1}.mp3`,
      fullFile: `full/${i + 1}.mp3`,
      coverFile:  `covers/cover${i + 1}.png`   
    }));
  }

}


class Player {
  constructor(user) {
    this.id = user.id;
    this.username = user.username || user.first_name || "Игрок";
    this.selectedSongs = new Set();
    this.board = [];
    this.hasChosenInRound = false; 
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

    for (let i = 0; i < 3; i++) {
      const horizontalWin = [0,1,2].every(j => this.selectedSongs.has(this.board[i*3 + j].id));
      if (horizontalWin) return true;

      const verticalWin = [0,1,2].every(j => this.selectedSongs.has(this.board[i + j*3].id));
      if (verticalWin) return true;
    }
    return false;
  }
}



class Lobby {
  constructor(hostUser, mode = "easy") {
    this.id = uuidv4().slice(0, 8).toUpperCase();
    this.mode = mode;
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
   // if (data === "next_round")            return this.handleNextRound(ctx);
      if (data === "host_next_round")   return this.handleNextRound(ctx);      // новая

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

  async createLobby(ctx, mode) {
    const hostUser = ctx.message.from;
    const lobby = new Lobby(hostUser, mode);
    this.lobbies.set(lobby.id, lobby);

    const botUsername = (await this.telegraf.telegram.getMe()).username;
    const joinLink = `https://t.me/${botUsername}?start=LOBBY_${lobby.id}`;
    await ctx.reply(
      `Лобби с уровнем ${mode} создано! Ссылка для приглашения:\n${joinLink}\nЖдем игроков...`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Начать игру", callback_data: "start_game" }],
            [{ text: "Следующий раунд ▶️", callback_data: "host_next_round" }],
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
  const song = lobby.currentSong
  
  const preview = lobby.mode === "hard" ? song.previewHardFile : song.previewFile;

  await this.telegraf.telegram.sendMessage(
    lobby.hostId,
    `🎵 Раунд ${lobby.currentRound} 🎵\n` +
    + `Проиграйте отрывок: ${lobby.currentSong.previewFile}\n`
    + `🎶 Играет: «${lobby.currentSong.title}»`
  );
  await this.telegraf.telegram.sendAudio(
    lobby.hostId,
    { source: preview }, 
    
  )
  for (const player of lobby.players.values()) {
    if (player.id === lobby.hostId) continue;           

    const keyboard = generateKeyboard(player.board, player.selectedSongs);

    await this.telegraf.telegram.sendMessage(
      player.id,
      `Раунд ${lobby.currentRound}\nВыберите песню:`,
      { reply_markup: keyboard }
    );
  }
}

async handleSongSelection(ctx, songIdStr) {
  const userId = ctx.callbackQuery.from.id;
  const songId = Number(songIdStr);

  const lobby  = this.findLobbyByPlayer(userId);
  if (!lobby)                   return ctx.answerCbQuery("Вы не в игре");
  if (userId === lobby.hostId)  return ctx.answerCbQuery("Хост не выбирает песни");

  const player = lobby.players.get(userId);
  if (!player)                  return ctx.answerCbQuery("Игрок не найден");
  if (player.hasChosenInRound)  return ctx.answerCbQuery("Вы уже выбрали");

  player.hasChosenInRound = true;
  const isCorrect = songId === lobby.currentSong.id;

  if (isCorrect) {
    player.chooseSong(songId);          // фиксируем только верные песни

    if (player.checkWin()) {            // победа сразу
      lobby.gameStarted = false;
      for (const p of lobby.players.values())
        this.telegraf.telegram.sendMessage(p.id, `🏆 Победитель: ${player.username}!`);
      return ctx.answerCbQuery("Поздравляем, вы собрали линию!");
    }
  }

  /* перерисовываем сообщение */
  const newMarkup = generateKeyboard(
    player.board,
    isCorrect ? player.selectedSongs : new Set()
  );
  await ctx.editMessageText(
    `Раунд ${lobby.currentRound}\n${isCorrect ? "✅ Верно!" : "❌ Мимо"}\nЖдите раскрытия…`,
    { reply_markup: newMarkup }
  );

  lobby.roundSelections.set(userId, songId);      // регистрируем попытку
  await ctx.answerCbQuery("Выбор принят. Ожидайте!");

  /* если все выбрали — сигнал хосту */
  if (lobby.allPlayersChosen()) {
    await this.telegraf.telegram.sendMessage(
      lobby.hostId,
      `Все игроки сделали выбор в раунде ${lobby.currentRound}.`,
      { reply_markup: { inline_keyboard: [[{ text: "Показать ответ", callback_data: "reveal_answer" }]] } }
    );
  }
}



    // ░░░ ➍  Логика раскрытия ответа
async handleReveal(ctx) {
  const hostId = ctx.callbackQuery.from.id;
  const lobby  = this.findLobbyByHost(hostId);
  if (!lobby) return;
  await this.telegraf.telegram.sendAudio(
    hostId,
    { source: lobby.currentSong.fullFile }, 
    
  )

  await ctx.editMessageReplyMarkup({inline_keyboard: []});

  for (const [id, player] of lobby.players) {
    if (id === hostId) continue;                   

    const chosenId = lobby.roundSelections.get(id);
    const correct  = (chosenId === lobby.currentSong.id);
    const mark     = correct ? "✅ Верно!" : "❌ Мимо";

    await this.telegraf.telegram.sendPhoto(
      id, 
      {
        source: lobby.currentSong.coverFile
      }, 
        { caption: `${mark}\nОригинал: «${lobby.currentSong.title}»` }

    )

   
  }

  let summary = "🎤 Итоги раунда:\n";
  for (const [id, songId] of lobby.roundSelections) {
    const p = lobby.players.get(id);
    const res = songId === lobby.currentSong.id ? "угадал ✅" : "не угадал ❌";
    summary += `• ${p.username} — ${res}\n`;
  }
  await this.telegraf.telegram.sendMessage(hostId, summary, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "▶️ Следующий раунд", callback_data: "host_next_round" }]
      ]
    }
  });

 

}



  async handleNextRound(ctx) {
  const hostId = ctx.callbackQuery.from.id;
  const lobby  = this.findLobbyByHost(hostId);
  if (!lobby) return;

  if (lobby.isLastRound()) {
    await ctx.answerCbQuery("Все песни сыграны. Игра окончена.");
    return;
  }

  /* кнопку «Следующий раунд» убираем, иначе её можно нажать повторно */
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });

  if (lobby.nextRound()) {
    await this.sendRoundMessages(lobby);
    await ctx.answerCbQuery();          // короткое подтверждение
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
