const admin = require('firebase-admin');
const fetch = require("node-fetch");
const moment = require('moment');
require('moment/locale/ru');

class MyFirstBotApp {

    /**
     * @public
     */
    constructor() {
        console.log('');
        console.log('[MyFirstBotApp]: Create Application...');

        /**
         * @type {string}
         * @private
         */
        this._myWebsite = 'vadimcpp.ru';

        this._pinnedMessageId = null;

        this._chatIdTest = '-1001496443397'; // @frontendBasics
        this._chatIdProd = '-1001396932806'; // @events4friends
        this._chatId = process.env.NODE_ENV === 'development' ? this._chatIdTest : this._chatIdProd;

        const firebaseServiceAccount = {
            "type": "service_account",
            "project_id": "events4friends",
            "private_key_id": process.env.PRIVATE_KEY_ID,
            "private_key": decodeURI(process.env.PRIVATE_KEY),
            "client_email": process.env.CLIENT_EMAIL,
            "client_id": process.env.CLIENT_ID,
            "auth_uri": process.env.AUTH_URI,
            "token_uri": process.env.TOKEN_URI,
            "auth_provider_x509_cert_url": process.env.AUTH_PROVIDER_X509_CERT_URL,
            "client_x509_cert_url": process.env.CLIENT_X509_CERT_URL,
        }
        
        this._adminId = '148045459'; // @vadimcpp

        /**
         * @type {Object}
         * @private
         */
        this._firebaseApp = admin.initializeApp({
            credential: admin.credential.cert(firebaseServiceAccount),
            databaseURL: process.env.DATABASE_URL
        }, 'events4friends-bot');

        console.log(' 2️⃣  [MyFirstBotApp]: Connected as ' + this._firebaseApp.name);        
    }

    /**
     * @private
     */
    _getStartDate = (event) => {
        let startDate = 'Не указано';

        if (event && event.start) {
            startDate = moment(event.start).format('D MMMM, dddd');
        }

        return startDate;
    }

    /**
     * @private
     */
    _getStartTime = (event) => {
        let startDate = 'Не указано';

        if (event && event.start) {
            startDate = moment(event.start).format('HH:mm');
        }

        return startDate;
    }

    /**
     * @private
     */
    _getTimezone = (event) => {
        let timezone = '';

        if (event && event.timezone === '+0200') {
            timezone += ' (Клд)';
        }
        if (event && event.timezone === '+0300') {
            timezone += ' (Мск)';
        }

        return timezone;
    }       

    /**
     * @private
     */
    _formatEvents = (events) => {
        const now = new Date(); 
        let message = '';

        events = events.filter(event => {
            return event.start && event.timezone
                ? moment(`${event.start}${event.timezone}`).toDate() > now
                : false;
        });

        events.sort((a, b) => {
            if (a.start > b.start) {
                return 1;
            } else if (a.start < b.start) {
                return -1;
            }
            return 0;
        });

        if (events.length > 0) {
            message += 'Предстоящие мероприятия:\n\n';

            for(let i = 0; i < events.length; i++) {
                const event = events[i];
                const startDate = this._getStartDate(event);
                const startTime = this._getStartTime(event);
                const timezone = this._getTimezone(event);

                message += `📅 ${startDate} 🕗 ${startTime}${timezone} － «${event.summary}»`;
                if (event.isOnline) {
                    message += '🕸 Онлайн ';
                } else {
                    message += `📍 ${event.location} `;
                }
                const url = `https://events4friends.ru/#/event/${event.id}`
                message += `( [Подробнее...](${url}) )`
                message += '\n\n'
            }
        } else {
            message += 'Предстоящих мероприятий нет\n\n';
        }

        return message;
    }

    /**
     * @private
     */
    _getInfo = (aCallback) => {
        const that = this;
        const db = this._firebaseApp.firestore();
        db.collection("services").get()
        .then(function(querySnapshot) {
            const services = querySnapshot.docs.map(item => ({ ...item.data(), id: item.id }))
            
            db.collection("events").get()
            .then(function(querySnapshot) {
                const events = querySnapshot.docs.map(item => ({ ...item.data(), id: item.id }))
                
                let message = '';
                
                message += that._formatEvents(events);

                message += `Сообщества: [events4friends.ru/communities](https://events4friends.ru/#/communities)\n\n`;
                message += `Услуги: [events4friends.ru/services](https://events4friends.ru/#/services)`;
                
                aCallback(message)
            })
            .catch(function(error) {
                console.warn("Error getting services, skip: ", error);
                aCallback(
                    'Увы, произошла неизвестная ошибка. ' + 
                    'Обратитесь пожалуйста в техническую поддержку: @frontendbasics'
                );
            });
        })
        .catch(function(error) {
            console.warn("Error getting services, skip: ", error);
            aCallback(
                'Увы, произошла неизвестная ошибка. ' + 
                'Обратитесь пожалуйста в техническую поддержку: @frontendbasics'
            );
        });
    }

    /**
     * У личных чатов положительные ID
     *
     * @param {Object} msg
     * @return {boolean}
     * @private
     */
    _isPrivateMsg(msg) {
        return msg.chat.id > 0;
    }

    /**
     * @param {Object} bot
     * @param {function} aCallback
     * @private
     */
    _sendMessageToChatAndPin(bot, aCallback) {
        this._getInfo((aMessage) => {
            bot.sendMessage(this._chatId, aMessage, {                
                parse_mode: "Markdown",
                disable_web_page_preview: true,                        
            })
            .then((data) => {
                console.log('Message has sent');
                if (data && data.message_id) {
                    bot.pinChatMessage(this._chatId, data.message_id, {
                        disable_notification: true
                    })
                    .then(() => {
                        console.log('Message has pinned, save pinned message ID:', data.message_id);
                        this._pinnedMessageId = data.message_id
                        aCallback()
                    })
                    .catch((error) => {
                        console.log('Error pinning message:', error);
                    });
                }
            })
            .catch((error) => {
                console.log('Error sending message:', error);
            });
        })
    }

    /**
     * @param {Object} bot
     * @param {function} aCallback
     * @private
     */
    _updatePinnedMessage(bot, aCallback) {
        this._getInfo((aMessage) => {
            bot.editMessageText(aMessage, {                
                chat_id: this._chatId,
                message_id: this._pinnedMessageId,
                text: aMessage,
                parse_mode: "Markdown",
                disable_web_page_preview: true, 
            })
            .then(() => {
                console.log('Message has edited');
                aCallback();
            })
            .catch((error) => {
                console.log('Failed editing message:', error);
                console.log('Send and pin new instead');
                if (error 
                    && error.response 
                    && error.response.body
                    && error.response.body.description
                    && error.response.body.description ===
                        'Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message'
                ) {
                    console.log('Message is not modified: skip updating');
                } else {
                    this._sendMessageToChatAndPin(bot, () => {
                        console.log('Succesfully send and pin new message');
                    })
                }
            });
        })
    }

    /**
     * @param {Object} bot
     * @public
     */
    updatePinnedMessage = (bot) => {
        if (this._pinnedMessageId) {
            console.log('There is pinned message: ', this._pinnedMessageId)
            this._updatePinnedMessage(bot, () => {
                console.log('updatePinnedMessage callback')
            })
        } else {
            console.log('No pinned message found, create new one...')
            this._sendMessageToChatAndPin(bot, () => {
                console.log('sendMessageToChatAndPin callback')
            })    
        }
    }

    // Can use this function below, OR use Expo's Push Notification Tool-> https://expo.io/dashboard/notifications
    _sendPushNotification = async (expoPushToken, summary) => {
        const message = {
            to: expoPushToken,
            sound: 'default',
            title: 'Вы установили напоминание',
            body: `Сегодня состоится «${summary}»`,
            data: { data: 'goes here' },
            _displayInForeground: true,
        };
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        });
    };

    /**
     * /remind command handler
     *
     * @param {Object} bot
     * @param {Object} msg
     * @public
     */
    handleRemindCommand = (bot, msg) => {
        const that = this;

        if (msg.chat.id == this._adminId) {
            const db = this._firebaseApp.firestore();

            //
            // NOTE!
            // Получаем напоминания reminders из базы данных 
            //
            db.collection("reminders").get()
            .then(function(querySnapshot) {
                let reminders = querySnapshot.docs.map(item => ({ ...item.data(), id: item.id }))

                //
                // NOTE!
                // Получаем напоминания events из базы данных 
                //
                db.collection("events").get()
                .then(function(eventsSnapshot) {
                    let events = eventsSnapshot.docs.map(item => ({ ...item.data(), id: item.id }))

                    //
                    // NOTE!
                    // Фильтруем события: оставляем только те, которые будут сегодня.
                    //
                    events = events.filter(event => moment(event.start).isSame(new Date(), 'day'));

                    //
                    // NOTE!
                    // Фильтруем напоминания: оставляем только напоминания для отфильтрованых событий.
                    //
                    reminders = reminders.filter(reminder => {
                        const reminderEventId = reminder.eventId;
                        for(let i = 0; i < events.length; i++) {
                            const event = events[i];
                            if (reminderEventId == event.id) {
                                return true;
                            }
                        }
                        return false;
                    })

                    //
                    // NOTE!
                    // Изменяем напоминания: добавляем данные о событии
                    //
                    reminders = reminders.map(reminder => {
                        const reminderEventId = reminder.eventId;
                        for(let i = 0; i < events.length; i++) {
                            const event = events[i];
                            if (reminderEventId == event.id) {
                                return {
                                    summary: event.summary,
                                    ...reminder,
                                }    
                            }
                        }
                        return reminder;
                    })
                    console.log('filtered and updated reminders:', reminders);

                    //
                    // NOTE!
                    // Отправляем PUSH уведомления
                    //
                    for(let i = 0; i < reminders.length; i++) {
                        that._sendPushNotification(reminders[i].expoPushToken, reminders[i].summary);
                    }

                    bot.sendMessage(
                        msg.chat.id,
                        'Отправлены push-уведомления на все устройства для событий сегодня. Проверяйте!'
                    );
                })
                .catch(function(error) {
                    console.warn("Error getting events, skip: ", error);
                    aCallback(
                        'Увы, произошла неизвестная ошибка. ' + 
                        'Обратитесь пожалуйста в техническую поддержку: @frontendbasics'
                    );
                });
            })
            .catch(function(error) {
                console.warn("Error getting reminders, skip: ", error);
                aCallback(
                    'Увы, произошла неизвестная ошибка. ' + 
                    'Обратитесь пожалуйста в техническую поддержку: @frontendbasics'
                );
            });
        } else {
            bot.sendMessage(
                msg.chat.id,
                "К сожалению, у Вас нет прав выполнить эту команду. Попробуйте /info"
            );
        }
    }

    // Can use this function below, OR use Expo's Push Notification Tool-> https://expo.io/dashboard/notifications
    _sendTestPushNotification = async (expoPushToken) => {
        const message = {
            to: expoPushToken,
            sound: 'default',
            title: 'Дорогие котики 🐈',
            body: 'Вы прекрасны 😻!!!',
            data: { data: 'goes here' },
            _displayInForeground: true,
        };
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        });
    };

    /**
     * /testpush command handler
     *
     * @param {Object} bot
     * @param {Object} msg
     * @public
     */
    handleTestpushCommand = (bot, msg) => {
        const that = this;

        if (msg.chat.id == this._adminId) {
            const db = this._firebaseApp.firestore();

            //
            // NOTE!
            // Получаем напоминания reminders из базы данных 
            //
            db.collection("reminders").get()
            .then(function(querySnapshot) {
                let reminders = querySnapshot.docs.map(item => ({ ...item.data(), id: item.id }))

                //
                // NOTE!
                // Получаем напоминания events из базы данных 
                //
                db.collection("events").get()
                .then(function(eventsSnapshot) {
                    let events = eventsSnapshot.docs.map(item => ({ ...item.data(), id: item.id }))

                    //
                    // NOTE!
                    // Фильтруем события: оставляем только те, которые будут сегодня.
                    //
                    events = events.filter(event => moment(event.start).isSame(new Date(), 'day'));

                    //
                    // NOTE!
                    // Фильтруем напоминания: оставляем только напоминания для отфильтрованых событий.
                    //
                    reminders = reminders.filter(reminder => {
                        const reminderEventId = reminder.eventId;
                        for(let i = 0; i < events.length; i++) {
                            const event = events[i];
                            if (reminderEventId == event.id) {
                                return true;
                            }
                        }
                        return false;
                    })
                    console.log('filtered reminders:', reminders);

                    //
                    // NOTE!
                    // Отправляем PUSH уведомления
                    //
                    for(let i = 0; i < reminders.length; i++) {
                        that._sendTestPushNotification(reminders[i].expoPushToken);
                    }

                    bot.sendMessage(
                        msg.chat.id,
                        'Отправлены тестовые push-уведомления на все устройства для событий сегодня. Проверяйте!'
                    );
                })
                .catch(function(error) {
                    console.warn("Error getting events, skip: ", error);
                    aCallback(
                        'Увы, произошла неизвестная ошибка. ' + 
                        'Обратитесь пожалуйста в техническую поддержку: @frontendbasics'
                    );
                });
            })
            .catch(function(error) {
                console.warn("Error getting reminders, skip: ", error);
                aCallback(
                    'Увы, произошла неизвестная ошибка. ' + 
                    'Обратитесь пожалуйста в техническую поддержку: @frontendbasics'
                );
            });
        } else {
            bot.sendMessage(
                msg.chat.id,
                "К сожалению, у Вас нет прав выполнить эту команду. Попробуйте /info"
            );
        }        
    }

    /**
     * Main event handler
     *
     * @param {Object} msg
     * @param {Object} bot
     * @public
     */
    handleMessage(msg, bot) {
        console.log('');
        console.log(JSON.stringify(msg));

        if (this._isPrivateMsg(msg)) {
            /**
             * @type {string}
             */
            let messageText = msg.text;

            if (messageText === '/start') {
                messageText =
                    'Здравствуйте, ' + this._getName(msg) + ".\n\n" +
                    'Этот бот создан для телеграм чата @events4friends. ' + 
                    'Бот следит за изменениями на сайте [events4friend.ru](https://events4friends.ru/) ' + 
                    'и обновляет информацию в закрепленном сообщении чата.\n\n' +
                    'Введите команду /info, чтобы посмотреть инормацию об услугах и мероприятиях.';
                bot.sendMessage(msg.chat.id, messageText, {                
                    parse_mode: "Markdown",
                    disable_web_page_preview: true,                        
                });                
        
            } else if (messageText === '/info') {
                this._getInfo((aMessage) => {
                    bot.sendMessage(msg.chat.id, aMessage, {                
                        parse_mode: "Markdown",
                        disable_web_page_preview: true,                        
                    });                 
                })
            } else if (messageText === '/update') {
                this.updatePinnedMessage(bot);
            } else if (messageText === '/remind') {
                this.handleRemindCommand(bot, msg);
            } else if (messageText === '/testpush') {
                this.handleTestpushCommand(bot, msg);
            } else {
                messageText =
                    'Уважаемый(ая) ' + this._getName(msg) + ".\n\n" +
                    'Введите команду /info, чтобы посмотреть инормацию об услугах и мероприятиях.';
                bot.sendMessage(msg.chat.id, messageText, {                
                    parse_mode: "Markdown",
                    disable_web_page_preview: true,                        
                });                
            }
        } else {
            console.log('Ignore group chats');               
        }        
    }

    /**
     * @param {Object} msg
     * @return {string}
     * @private
     */
    _getName(msg) {
        /**
         * @type {string}
         */
        let result = 'Без имени 👤';

        /**
         * @type {string}
         */
        let fname = msg.from.first_name;

        /**
         * @type {string}
         */
        let lname = msg.from.last_name;

        /**
         * @type {string}
         */
        let uname = msg.from.username;

        if (fname) {
            result = fname + ( lname ? ' ' + lname : '') ;    
        } else if (uname) {
            result = uname;
        }

        return result;
    }
}

module.exports = MyFirstBotApp;
