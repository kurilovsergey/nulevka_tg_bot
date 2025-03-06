const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const moment = require('moment');
require('dotenv').config();

const token = env.token;
const adminId = env.adminId;
const assistantId = env.assistantId;
const bot = new TelegramBot(token, { polling: true });

const betsFile = 'bets.json';
const matchesFile = 'matches.json';
const currentRoundFile = 'currentRound.json';
const matchDateFile = 'matchDate.json';

const playerNames = {
    "kurilovsergey": "Серега К",
    "MinyaKorol": "МАЙКЛ",
    "Sherlok69": "ШЕРЛОК",
    "mikhail_karpukhin": "МИША",
    "balonm": "ВИТАЛЯ",
    "shenanigans09": "ОЛЕГ",
    "serzhkurch50": "СЕРЖ",
    "vasek88": "ВАСЯ",
    "Mixail_Varnavskiy": "МИККИ",
    "Ivanes_24": "ИВАН",
    "matrade_1911": "ШАМ",
    "SKK190": "СТАС",
    "SSV_Cleanair": "СЛАВА",
    "filaiva": "ВАНЯ Ф",
    "korushka19": "АЛЕКСЕЙ"
};

// Функция для получения имени игрока
function getPlayerName(username) {
    return playerNames[username] || username;
}

// Функция для создания основного меню с кнопками
function createMainMenu(chatId) {
    let menu = {
        reply_markup: {
            keyboard: [
                ['Посмотреть матчи', 'Сделать ставку'],
                ['Мой прогноз', 'Удалить мой прогноз']
            ],
            resize_keyboard: true,
            one_time_keyboard: false // Убрано one_time_keyboard, чтобы меню оставалось
        }
    };

    // Для главного администратора
    if (chatId === adminId) {
        menu.reply_markup.keyboard.push(['Установить текущий тур', 'Просмотр ставок', 'Очистить ставки']);
    }

    // Для заместителя админа
    if (chatId === assistantId) {
        menu.reply_markup.keyboard.push(['Установить текущий тур']);
    }

    return menu;
}

let bets = {};
let matches = {};
let currentRound = null;
let matchDate = null;

function loadData() {
    if (fs.existsSync(betsFile)) bets = JSON.parse(fs.readFileSync(betsFile, 'utf8'));
    if (fs.existsSync(matchesFile)) matches = JSON.parse(fs.readFileSync(matchesFile, 'utf8'));
    if (fs.existsSync(currentRoundFile)) currentRound = JSON.parse(fs.readFileSync(currentRoundFile, 'utf8')).round;
    if (fs.existsSync(matchDateFile)) {
        const savedDate = JSON.parse(fs.readFileSync(matchDateFile, 'utf8')).date;
        matchDate = moment.utc(savedDate).utcOffset('+0300');
    }
}

function saveBets() {
    fs.writeFileSync(betsFile, JSON.stringify(bets, null, 2));
}

function saveCurrentRound() {
    fs.writeFileSync(currentRoundFile, JSON.stringify({ round: currentRound }, null, 2));
}

function saveMatchDate() {
    fs.writeFileSync(matchDateFile, JSON.stringify({ date: matchDate.toISOString() }, null, 2));
}

function getMoscowTime() {
    return moment().utcOffset('+0300');
}

// Функция для вывода времени с добавлением 3 часов
function formatTimeWithOffset(time) {
    return time.clone().add(3, 'hours').format('DD.MM.YYYY HH:mm');
}

loadData();

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Добро пожаловать! Выберите действие:', createMainMenu(chatId));
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const username = msg.from.username || `user_${chatId}`;

    const nowMoscow = getMoscowTime();
    const isTourStarted = matchDate && nowMoscow.isAfter(matchDate);
    const timeUntilMatch = matchDate ? matchDate.from(nowMoscow) : null;

    if (text === 'Посмотреть матчи') {
        if (!currentRound || !matches[currentRound]) {
            bot.sendMessage(chatId, "Матчи текущего тура не установлены.", createMainMenu(chatId));
        } else {
            let matchInfo = `Матчи тура ${currentRound}:\n${matches[currentRound].join('\n')}`;
            if (matchDate) {
                matchInfo += `\n\nДедлайн ставок: ${formatTimeWithOffset(matchDate)} (МСК)\nДо конца приема ставок: ${timeUntilMatch}`;
            }
            bot.sendMessage(chatId, matchInfo);
        }
    } else if (text === 'Сделать ставку') {
        const nowMoscow = getMoscowTime();
        const isTourStarted = matchDate && nowMoscow.isAfter(matchDate);
        console.log('Now Moscow:', nowMoscow.format('DD.MM.YYYY HH:mm Z'));
        console.log('Match Date:', matchDate.format('DD.MM.YYYY HH:mm Z'));
        console.log('Is Tour Started?', isTourStarted);

        if (isTourStarted) {
            bot.sendMessage(chatId, "❌ Тур начался, ставки закрыты.", createMainMenu(chatId));
        } else if (!currentRound || !matches[currentRound]) {
            bot.sendMessage(chatId, "Матчи текущего тура не установлены.", createMainMenu(chatId));
        } else {
            if (bets[chatId]) {
                bot.sendMessage(chatId, 'Вы уже сделали ставку.', createMainMenu(chatId));
            } else {
                bot.sendMessage(chatId, 'Сделайте ставку на первый матч:', createMainMenu(chatId));
                askForBet(chatId, username);
            }
        }
    } else if (text === 'Удалить мой прогноз') {
        if (isTourStarted) {
            bot.sendMessage(chatId, "Тур начался, действия с прогнозом невозможны.", createMainMenu(chatId));
        } else if (bets[chatId]) {
            delete bets[chatId];
            saveBets();
            bot.sendMessage(chatId, "Ваши ставки были удалены.", createMainMenu(chatId));
        } else {
            bot.sendMessage(chatId, "У вас нет ставок для удаления.", createMainMenu(chatId));
        }
    } else if (text === 'Просмотр ставок' && (chatId === adminId || chatId === assistantId)) {
        let allBets = Object.keys(bets).map(user => {
            let betInfo = bets[user];
            let totalGoals = betInfo.bets.reduce((total, bet) => {
                let score = bet.bet.split(/[-:]/).map(num => parseInt(num));
                return total + score[0] + score[1];
            }, 0);

            let betDetails = betInfo.bets.map(bet => `${bet.match}: ${bet.bet}`).join('\n');
            return `Игрок: @${betInfo.username}\nСтавки:\n${betDetails}\nТОТАЛ: ${totalGoals}`;
        }).join('\n\n');

        if (allBets === '') {
            bot.sendMessage(chatId, "Ставки ещё не сделаны.", createMainMenu(chatId));
        } else {
            bot.sendMessage(chatId, `Ставки всех игроков:\n\n${allBets}`, createMainMenu(chatId));
        }
    } else if (text === 'Мой прогноз') {
        if (!bets[chatId]) {
            bot.sendMessage(chatId, "Вы не сделали ставку.", createMainMenu(chatId));
        } else {
            let userBetInfo = bets[chatId];
            let totalGoals = userBetInfo.bets.reduce((total, bet) => {
                let score = bet.bet.split(/[-:]/).map(num => parseInt(num));
                return total + score[0] + score[1];
            }, 0);

            let betDetails = userBetInfo.bets.map(bet => `${bet.match}: ${bet.bet}`).join('\n');
            bot.sendMessage(chatId, `Ваши ставки:\n\n${betDetails}\nТОТАЛ: ${totalGoals}`, createMainMenu(chatId));
        }
    } else if (text === 'Очистить ставки' && chatId === adminId) {
        bets = {};
        saveBets();
        bot.sendMessage(chatId, "Все ставки были очищены.", createMainMenu(chatId));
    }
});

// Обработчик для установки текущего тура
bot.onText(/Установить текущий тур/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId !== adminId && chatId !== assistantId) return;

    bot.sendMessage(chatId, 'Введите номер текущего тура:', createMainMenu(chatId));
    bot.once('message', (msg) => {
        let round = msg.text.trim();
        console.log(`Получен ввод тура: ${round}`);
        if (isNaN(round) || !matches[round]) {
            bot.sendMessage(chatId, "❌ Неверный номер тура. Попробуйте снова.");
            return;
        }
        currentRound = round;
        saveCurrentRound();

        bot.sendMessage(chatId, 'Введите дату и время первого матча (DD.MM.YYYY HH:mm) в московском времени:');
        bot.once('message', (msg) => {
            let inputText = msg.text.trim();
            console.log(`Получен ввод даты: ${inputText}`);

            let matchTime = moment(inputText, 'DD.MM.YYYY HH:mm', true).utcOffset('+0300', true);
            console.log('Parsed match time:', matchTime.format('DD.MM.YYYY HH:mm Z'));
            console.log('UTC equivalent:', matchTime.utc().format('DD.MM.YYYY HH:mm Z'));

            if (!matchTime.isValid()) {
                bot.sendMessage(chatId, "❌ Неверный формат даты. Введите в формате DD.MM.YYYY HH:mm (например, 05.03.2025 22:30)");
                return;
            }

            matchDate = matchTime;
            saveMatchDate();
            bot.sendMessage(chatId, `✅ Тур ${currentRound} установлен, первый матч: ${formatTimeWithOffset(matchDate)} (МСК).`, createMainMenu(chatId));

            let allBets = Object.keys(bets).map(user => {
                let betInfo = bets[user];
                let totalGoals = betInfo.bets.reduce((total, bet) => {
                    let score = bet.bet.split(/[-:]/).map(num => parseInt(num));
                    return total + score[0] + score[1];
                }, 0);

                let betDetails = betInfo.bets.map(bet => `${bet.match}: ${bet.bet}`).join('\n');
                let playerName = getPlayerName(betInfo.username);
                return `Игрок: @${betInfo.username} (${playerName})\nСтавки:\n${betDetails}\nТОТАЛ: ${totalGoals}`;
            }).join('\n\n');

            if (allBets !== '') {
                Object.keys(bets).forEach((playerChatId) => {
                    bot.sendMessage(playerChatId, `⚠️ Ставки закрыты!\n\nСтавки всех игроков:\n\n${allBets}`, createMainMenu(playerChatId));
                });
            }

            bets = {};
            saveBets();
        });
    });
});

function askForBet(chatId, username) {
    let userBets = [];
    let matchesForRound = matches[currentRound];

    function ask(index) {
        if (index >= matchesForRound.length) {
            bets[chatId] = { username, bets: userBets };
            saveBets();
            bot.sendMessage(chatId, "✅ Ставки сохранены.", createMainMenu(chatId));
            return;
        }

        bot.sendMessage(chatId, `Ставка на матч: ${matchesForRound[index]}`, createMainMenu(chatId));
        bot.once('message', (msg) => {
            if (!/^\d{1,2}[-:]\d{1,2}$/.test(msg.text.trim())) {
                bot.sendMessage(chatId, "❌ Неверный формат. Введите счёт в формате 2-1.", createMainMenu(chatId));
                ask(index);
                return;
            }
            userBets.push({ match: matchesForRound[index], bet: msg.text.trim() });
            ask(index + 1);
        });
    }
    ask(0);
}

bot.on('polling_error', (error) => {
    console.error('Polling error:', error.message || error);
});

console.log("Бот стартанул!");
