const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const moment = require('moment');
require('dotenv').config();

// Получаем значения переменных
const token = process.env.token;
const adminId = process.env.adminId;
const assistantId = process.env.assistantId

//const token = '8010639257:AAHagoqQeBtTuT-o9SnHr9G1uka1-bX8FnE'; // Укажите свой токен
//const adminId = 135224612; // ID главного администратора
//const assistantId = 5209894548; // ID заместителя админа
const bot = new TelegramBot(token, { polling: true });

const betsFile = 'bets.json';
const matchesFile = 'matches.json';
const currentRoundFile = 'currentRound.json'; // Файл для хранения текущего тура
const matchDateFile = 'matchDate.json'; // Файл для хранения даты и времени первого матча

let bets = {};
let matches = {};
let currentRound = null;
let matchDate = null; // Дата и время первого матча

// Загрузка данных из файлов
function loadData() {
    if (fs.existsSync(betsFile)) {
        bets = JSON.parse(fs.readFileSync(betsFile, 'utf8'));
    }
    if (fs.existsSync(matchesFile)) {
        matches = JSON.parse(fs.readFileSync(matchesFile, 'utf8'));
    }
    if (fs.existsSync(currentRoundFile)) {
        const data = JSON.parse(fs.readFileSync(currentRoundFile, 'utf8'));
        currentRound = data.round;
    }
    if (fs.existsSync(matchDateFile)) {
        const data = JSON.parse(fs.readFileSync(matchDateFile, 'utf8'));
        matchDate = moment(data.date); // Преобразуем дату в момент времени
    }
}

// Сохранение ставок в файл
function saveBets() {
    fs.writeFileSync(betsFile, JSON.stringify(bets, null, 2));
}

// Сохранение текущего тура в файл
function saveCurrentRound() {
    fs.writeFileSync(currentRoundFile, JSON.stringify({ round: currentRound }, null, 2));
}

// Сохранение даты первого матча в файл
function saveMatchDate() {
    fs.writeFileSync(matchDateFile, JSON.stringify({ date: matchDate.format() }, null, 2));
}

loadData();

// Функция для создания основного меню с кнопками
function createMainMenu(chatId) {
    let menu = {
        reply_markup: {
            keyboard: [
                ['Посмотреть матчи', 'Сделать ставку'],
                ['Мой прогноз', 'Удалить мой прогноз', 'Правила']
            ],
            resize_keyboard: true,
            one_time_keyboard: true
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

// Команда /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Добро пожаловать, нулевщик! 🍺⚽ Выберите действие:', createMainMenu(chatId));
});

// Обработчик кнопок
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const username = msg.from.username; // Используем никнейм пользователя вместо ID

    // Проверка, начался ли тур
    const isTourStarted = matchDate && moment().isAfter(matchDate);

    if (text === 'Посмотреть матчи') {
        if (!currentRound || !matches[currentRound]) {
            bot.sendMessage(chatId, "Матчи текущего тура не установлены.");
        } else {
            bot.sendMessage(chatId, `Матчи тура ${currentRound}:\n${matches[currentRound].join('\n')}`);
        }
    } else if (text === 'Сделать ставку') {
        if (isTourStarted) {
            bot.sendMessage(chatId, "Тур начался, ставки больше не возможны.");
        } else if (!currentRound || !matches[currentRound]) {
            bot.sendMessage(chatId, "Матчи текущего тура не установлены.");
        } else {
            if (bets[username]) {
                bot.sendMessage(chatId, 'Вы уже сделали ставку. Больше ставок нельзя делать.');
            } else {
                bot.sendMessage(chatId, 'Для начала сделайте ставку на первый матч:');
                askForBet(chatId, username);
            }
        }
    } else if (text === 'Удалить мой прогноз') {
        if (isTourStarted) {
            bot.sendMessage(chatId, "Тур начался, действия с прогнозом невозможны.");
        } else if (bets[username]) {
            delete bets[username];
            saveBets();
            bot.sendMessage(chatId, "Ваши ставки были удалены.");
        } else {
            bot.sendMessage(chatId, "У вас нет ставок для удаления.");
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
            bot.sendMessage(chatId, "Ставки ещё не сделаны.");
        } else {
            bot.sendMessage(chatId, `Ставки всех игроков:\n\n${allBets}`);
        }
    } else if (text === 'Мой прогноз') {
        if (!bets[username]) {
            bot.sendMessage(chatId, "Вы не сделали ставку.");
        } else {
            let userBetInfo = bets[username];
            let totalGoals = userBetInfo.bets.reduce((total, bet) => {
                let score = bet.bet.split(/[-:]/).map(num => parseInt(num));
                return total + score[0] + score[1];
            }, 0);

            let betDetails = userBetInfo.bets.map(bet => `${bet.match}: ${bet.bet}`).join('\n');
            bot.sendMessage(chatId, `Ваши ставки:\n\n${betDetails}\nТОТАЛ: ${totalGoals}`);
        }
    } else if (text === 'Очистить ставки' && chatId === adminId) {
        bets = {};
        saveBets();
        bot.sendMessage(chatId, "Все ставки были очищены.");
    } else if (text === 'Установить текущий тур' && (chatId === adminId || chatId === assistantId)) {
        bot.sendMessage(chatId, 'Введите номер текущего тура:');
        bot.once('message', (msg) => {
            let round = msg.text.trim();
            if (isNaN(round) || !matches[round]) {
                bot.sendMessage(chatId, "Неверный номер тура. Попробуйте снова.");
            } else {
                currentRound = round;
                saveCurrentRound();
                bot.sendMessage(chatId, 'Введите дату и время первого матча в формате: DD.MM.YYYY HH:mm (например, 02.03.2024 20:00)');
                bot.once('message', (msg) => {
                    let matchTime = msg.text.trim();
                    let validDate = moment(matchTime, 'DD.MM.YYYY HH:mm', true);

                    if (!validDate.isValid()) {
                        bot.sendMessage(chatId, "Неверный формат даты и времени. Попробуйте снова.");
                    } else {
                        matchDate = validDate;
                        saveMatchDate();
                        bot.sendMessage(chatId, `Тур установлен на тур ${currentRound}, первый матч будет играться ${matchDate.format('DD.MM.YYYY HH:mm')}.`);
                    }
                });
            }
        });
    }
});

// Функция для подсчета Тотала
function calculateTotal(betsList) {
    let total = 0;
    for (let bet of betsList) {
        let scores = bet.bet.split(/[-:]/).map(num => parseInt(num));
        total += scores.reduce((sum, num) => sum + num, 0);
    }
    return total;
}

// Функция для запроса ставки на матч
function askForBet(chatId, username) {
    let userBets = [];
    let matchesForRound = matches[currentRound];

    function ask(index) {
        if (index >= matchesForRound.length) {
            bets[username] = { username: username, bets: userBets };
            saveBets();
            bot.sendMessage(chatId, "Ваши ставки сохранены. Удачи!");
            return;
        }

        let match = matchesForRound[index];
        bot.sendMessage(chatId, `Сделайте ставку на матч: ${match}`);

        bot.once('message', (msg) => {
            let bet = msg.text.trim();
            if (!/^\d{1,2}[-]\d{1,2}$/.test(bet)) {
                bot.sendMessage(chatId, "Неверный формат. Попробуйте ещё раз.");
                ask(index);
                return;
            }
            userBets.push({ match, bet });
            ask(index + 1);
        });
    }
    ask(0);
}

console.log("Бот запущен",token);
