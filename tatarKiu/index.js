import { Telegraf } from "telegraf";
import { v4 as uuidv4 } from "uuid";
import QRCode from "qrcode";
const mapSongs = new Map([
  [1, "Уфтанма"],
  [2, "Ак каен"],
  [3, "Каеннар арсында"],
  [4, "Бәхеттә, шатлыкта"],
  [5, "Әйдә, сандугач"],
  [6, "Чияләр"],
  [7, "Син җанымның яртысы"],
  [8, "Чыгарсыңмы каршы алырга"],
  [9, "Кышкы чия"],
  [10, "Бәхетле гомерләрдә"],
  [11, "Туй күлмәге"],
  [12, "Миңа нишләргә?"],
  [13, "Ак чәчәкләр кебек кар ява"],
  [14, "Әниемә"],
  [15, "Бер тутырып карадың"],
  [16, "Каеннар арсында"],
  [17, "Ак каен"],
  [18, "Әниемә"],
  [19, "Бер үбәсем килә"],
  [20, "Мин яратам сине, Татарстан"],
])


class MusicLibrary {
  constructor() {
    this.songs = this.loadSongs();
  }
  loadSongs() {
    return [...Array(15)].map((_, i) => ({
      id: i + 1,
      title: `${i + 1}.${mapSongs.get(i+1)}`,
      previewFile: `previews/${i + 1}.mp3`,
      previewHardFile: `previewsminus2/${i + 1}.mp3`,
      fullFile: `full2/${i + 1}.mp3`,
      coverFile:  `covers2/${i + 1}.JPG`
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
    this.mode = mode
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

  getTopScorer() {
    let maxScore = 0;
    let winners = [];

    for (const player of this.players.values()) {
      if (player.id === this.hostId) continue; // Хост не играет

      const score = player.selectedSongs.size;
      if (score > maxScore) {
        maxScore = score;
        winners = [player];
      } else if (score === maxScore) {
        winners.push(player);
      }
    }

    return { winners, maxScore };
  }

  getGameStats() {
    const stats = [];
    for (const player of this.players.values()) {
      if (player.id === this.hostId) continue;
      stats.push({
        username: player.username,
        score: player.selectedSongs.size
      });
    }
    return stats.sort((a, b) => b.score - a.score);
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
      if (data.startsWith("select_")) return this.handleSongSelection(ctx, data.slice(7));
      if (data === "start_game") return this.handleStartGame(ctx);
      if (data === "host_next_round") return this.handleNextRound(ctx);
      if (data === "reveal_answer") return this.handleReveal(ctx);

      // Новые обработчики
      if (data === "create_easy") return this.createLobbyWithMode(ctx, "easy");
      if (data === "create_hard") return this.createLobbyWithMode(ctx, "hard");
    });


    // Создание лобби
    this.telegraf.command("createlobby", async (ctx) => {
      await ctx.reply(
          "🎵 Выберите уровень сложности:",
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: "🟢 Легкий (со словами)", callback_data: "create_easy" }],
                [{ text: "🔴 Сложный (без слов)", callback_data: "create_hard" }]
              ]
            }
          }
      );
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
    const previewFile = lobby.mode === "hard"
        ? lobby.currentSong.previewHardFile
        : lobby.currentSong.previewFile;

    const modeEmoji = lobby.mode === "easy" ? "🟢" : "🔴";

    // Добавляем статистику в сообщение хосту
    const stats = lobby.getGameStats();
    let statsText = "\n\n📊 **Текущие очки:**\n";
    if (stats.length > 0) {
      stats.forEach(player => {
        statsText += `• ${player.username}: ${player.score}\n`;
      });
    } else {
      statsText += "Пока никто не угадал песни\n";
    }

    await this.telegraf.telegram.sendMessage(
        lobby.hostId,
        `🎵 Раунд ${lobby.currentRound} ${modeEmoji}\n` +
        `Проиграйте отрывок: ${previewFile}\n` +
        `🎶 Играет: «${lobby.currentSong.title}»` +
        statsText
    );

    await this.telegraf.telegram.sendAudio(
        lobby.hostId,
        { source: previewFile }
    );

    for (const player of lobby.players.values()) {
      if (player.id === lobby.hostId) continue;

      const keyboard = generateKeyboard(player.board, player.selectedSongs);
      await this.telegraf.telegram.sendMessage(
          player.id,
          `🎵 Раунд ${lobby.currentRound} ${modeEmoji}\n` +
          `💎 Ваши очки: ${player.selectedSongs.size}\n` +
          `Выберите песню:`,
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

  async createLobbyWithMode(ctx, mode) {
    const hostUser = ctx.callbackQuery.from;
    const lobby = new Lobby(hostUser, mode);
    this.lobbies.set(lobby.id, lobby);

    const botUsername = (await this.telegraf.telegram.getMe()).username;
    const joinLink = `https://t.me/${botUsername}?start=LOBBY_${lobby.id}`;
    const modeText = mode === "easy" ? "🟢 Легкий (со словами)" : "🔴 Сложный (без слов)";
    const qrBuffer = await QRCode.toBuffer(joinLink, {
      width: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    await ctx.editMessageText(
        `✅ Лобби создано!\n🎯 Режим: ${modeText}\n\n` +
        `Ссылка для приглашения:\n${joinLink}\n\nЖдем игроков...`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Начать игру", callback_data: "start_game" }],
              [{ text: "Следующий раунд ▶️", callback_data: "host_next_round" }],
            ],
          },
        }
    );

    await this.telegraf.telegram.sendPhoto(
        hostUser.id,
        { source: qrBuffer },
        { caption: `🎵 Сканируйте для входа в лобби ${lobby.id}` }
    );
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
    const lobby = this.findLobbyByHost(hostId);
    if (!lobby) return;

    if (lobby.isLastRound()) {
      // Все песни проиграны - определяем победителя по баллам
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });

      const { winners, maxScore } = lobby.getTopScorer();
      const stats = lobby.getGameStats();

      // Формируем таблицу результатов
      let resultsText = "🎵 **ИГРА ЗАВЕРШЕНА!** 🎵\n\n📊 **Итоговые результаты:**\n";
      stats.forEach((player, index) => {
        const medal = index === 0 ? "🏆" : index === 1 ? "🥈" : index === 2 ? "🥉" : "🔸";
        resultsText += `${medal} ${player.username}: ${player.score} песен\n`;
      });

      let winnerText = "";
      if (maxScore === 0) {
        winnerText = "\n🤷‍♂️ Никто не угадал ни одной песни!";
      } else if (winners.length === 1) {
        winnerText = `\n🏆 **Победитель: ${winners[0].username}** с ${maxScore} угаданными песнями!`;
      } else {
        const winnersNames = winners.map(p => p.username).join(", ");
        winnerText = `\n🤝 **Ничья между:** ${winnersNames} с ${maxScore} угаданными песнями!`;
      }

      const finalMessage = resultsText + winnerText;

      // Отправляем итоги всем игрокам
      for (const player of lobby.players.values()) {
        await this.telegraf.telegram.sendMessage(player.id, finalMessage);
      }

      // Завершаем игру
      lobby.gameStarted = false;
      await ctx.answerCbQuery("Игра завершена!");
      return;
    }

    // Обычный переход к следующему раунду
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });

    if (lobby.nextRound()) {
      await this.sendRoundMessages(lobby);
      await ctx.answerCbQuery();
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
const token = "8346415634:AAEZ6Lt_vesFmUSocZqnLpPPFyE1aAN9GdA"; // Лучше через process.env.TELEGRAM_BOT_TOKEN
new MusicLotoBot(token);
