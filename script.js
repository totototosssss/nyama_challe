
document.addEventListener('DOMContentLoaded', () => {
    let maxDaysGlobal = 15; // 15日固定

    const DIFFICULTY_PRESETS = {
        story: {
            resourceFactor: 1.2, stressFactor: 0.8, eventSeverityFactor: 0.7,
            shiroAggression: 0.5, positiveEventChance: 0.3, adhdPenaltyFactor: 0.7,
            sleepRecoveryFactor: 1.3, name: "物語体験モード"
        },
        normal: {
            resourceFactor: 1.0, stressFactor: 1.0, eventSeverityFactor: 1.0,
            shiroAggression: 1.0, positiveEventChance: 0.15, adhdPenaltyFactor: 1.0,
            sleepRecoveryFactor: 1.0, name: "通常モード"
        },
        reality: {
            resourceFactor: 0.8, stressFactor: 1.3, eventSeverityFactor: 1.2,
            shiroAggression: 1.5, positiveEventChance: 0.05, adhdPenaltyFactor: 1.3,
            sleepRecoveryFactor: 0.8, name: "にゃまの現実モード"
        }
    };

    const INITIAL_STATE_BASE = {
        day: 1,
        hp: 100,
        sanity: 70,
        philosophy: 20, // 初期哲学力は少し低めに
        money: 5000,     // 初期資金 (難易度で変動)
        sleepDebt: 0,
        shiroHate: 0,

        // 画像パス (stone.png を使用)
        nyamaImage: 'stone.png',
        nyamaHappyImage: 'stone.png', // 仮
        nyamaSadImage: 'stone.png',   // 仮
        nyamaEndingImageBase: 'stone_ending', //エンディング画像は stone_ending_xxx.png のように

        logMessage: '',
        inventory: [],
        permanentBuffs: {}, // 将来的にアイテム効果などで使用
        activeEffects: {},  // 一時的な効果 (薬、イベントなど)
        
        // にゃま固有のカウンタやフラグ (これから追加)
        adhdEpisodeCount: 0,
        shiroEngagedCount: 0,
        
        difficultySettings: {} // ここに選択された難易度設定が入る
    };
    let gameState = {};

    // DOM要素取得 (新しいIDや構造に合わせて調整)
    const difficultyScreen = document.getElementById('difficulty-selection-screen');
    const gameContainer = document.querySelector('.game-container');
    // ... (他の要素も同様に取得)
    const dayDisplayElem = document.getElementById('day-display');
    const maxDaysDisplayElem = document.getElementById('max-days-display');
    const moneyDisplayHeaderValue = document.getElementById('money-display-header-value');
    const nyamaImageElem = document.getElementById('nyama-image'); // ID変更
    const nyamaThoughtBubble = document.getElementById('nyama-thought-bubble'); // ID変更

    // パラメータ表示用DOM (新規)
    const hpDisplay = document.getElementById('hp-display');
    const sanityDisplay = document.getElementById('sanity-display');
    const philosophyDisplay = document.getElementById('philosophy-display');
    const sleepDebtDisplay = document.getElementById('sleepDebt-display');
    const shiroHateDisplay = document.getElementById('shiroHate-display');

    const logMessageDisplay = document.getElementById('log-message');
    const logMessageArea = document.getElementById('log-message-area');
    const actionButtonsNodeList = document.querySelectorAll('.action-buttons-grid button');
    const inventoryListElem = document.getElementById('inventory-list');
    const eventNotificationArea = document.getElementById('event-notification');
    const eventMessageElem = document.getElementById('event-message');

    // エンディングモーダル関連
    const endingModal = document.getElementById('ending-modal');
    const endingTitle = document.getElementById('ending-title');
    const endingNyamaImageElem = document.getElementById('ending-nyama-image');
    const endingCalcMsg = document.getElementById('ending-calculation-message');
    const endingActualResult = document.getElementById('ending-actual-result');
    const endingResultMessage = document.getElementById('ending-result-message');
    const restartGameButton = document.getElementById('restart-game-button');

    // ショップモーダル関連
    const itemShopModal = document.getElementById('item-shop-modal');
    const openShopButton = document.getElementById('open-shop-button');
    const shopMoneyDisplay = document.getElementById('shop-money-display');
    const itemShopListElem = document.getElementById('item-shop-list');
    const modalCloseButtons = document.querySelectorAll('.modal-close-button');

    // --- Helper Functions (clamp, getRandomInt etc. は元のままでOK) ---
    function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
    function getRandomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
    function getRandom(min, max) { return Math.random() * (max - min) + min; }

    // --- Log Helper (大きな変更なし、ログメッセージのスタイルはCSSで) ---
    const LogHelper = {
        currentLogEntries: [],
        add: function(message, type = '') { // typeは将来的なログ装飾用
            this.currentLogEntries.push({text: message, type: type});
        },
        // ... (commit, renderFullLogなど、大きな変更はなし)
        commitCurrentTurnToGameState: function(prependText = "") {
            if (this.currentLogEntries.length > 0) {
                let turnLogHtml = this.currentLogEntries.map(entry => {
                    // entry.type に応じてクラスを付与するなど、将来的に拡張
                    return `<span class="log-entry log-type-${entry.type || 'normal'}">${entry.text}</span>`;
                }).join('<br>');

                if (prependText) turnLogHtml = `<span class="log-entry log-type-day-sep">${prependText}</span><br>` + turnLogHtml;
                
                if (gameState.logMessage && !gameState.logMessage.endsWith('<br>') && gameState.logMessage !== "") {
                    gameState.logMessage += '<br>';
                }
                gameState.logMessage += turnLogHtml;
            }
            this.clearCurrentTurnLogs();
        },
        clearCurrentTurnLogs: function() { this.currentLogEntries = []; },
        renderFullLog: function() {
            if (logMessageDisplay && gameState.logMessage !== undefined) {
                logMessageDisplay.innerHTML = gameState.logMessage;
                if (logMessageArea) logMessageArea.scrollTop = logMessageArea.scrollHeight;
            }
        },
        setInitialLogMessage: function(message) {
            gameState.logMessage = `<span class="log-entry log-type-system">${message}</span>`;
            this.renderFullLog();
        },
        resetFullLog: function() {
            gameState.logMessage = ""; this.clearCurrentTurnLogs(); this.renderFullLog();
        }
    };

    // --- UI Update Function ---
    function updateMainUI() {
        // パラメータを範囲内に収める (gameState側でやった方が良いかも)
        gameState.hp = clamp(gameState.hp, 0, 100 + (gameState.permanentBuffs.maxHpBoost || 0));
        gameState.sanity = clamp(gameState.sanity, 0, 100 + (gameState.permanentBuffs.maxSanityBoost || 0));
        gameState.philosophy = clamp(gameState.philosophy, 0, 100); // Maxは調整
        gameState.money = Math.max(0, Math.round(gameState.money));
        gameState.sleepDebt = clamp(gameState.sleepDebt, 0, 100); // Maxは調整
        gameState.shiroHate = clamp(gameState.shiroHate, 0, 100); // Maxは調整

        dayDisplayElem.textContent = gameState.day;
        maxDaysDisplayElem.textContent = maxDaysGlobal;
        moneyDisplayHeaderValue.textContent = gameState.money;

        // 新しいパラメータ表示を更新
        hpDisplay.textContent = gameState.hp;
        sanityDisplay.textContent = gameState.sanity;
        philosophyDisplay.textContent = gameState.philosophy;
        sleepDebtDisplay.textContent = gameState.sleepDebt;
        shiroHateDisplay.textContent = gameState.shiroHate;

        nyamaImageElem.src = gameState.nyamaImage; // 画像更新 (状態に応じて変えるのは今後)
        // TODO: パラメータ変動時のflashParamValueのような演出を新しいパラメータにも適用

        LogHelper.renderFullLog();
        updateInventoryList(); // インベントリ表示更新
        
        // 行動ボタンの有効/無効制御 (HP0など)
        actionButtonsNodeList.forEach(button => {
            if (gameState.hp <= 0 && button.dataset.action !== 'try_to_rest' /*など特定の行動以外*/) {
                // button.disabled = true; // ゲームオーバー処理で一括無効化するのでここでは不要かも
            } else {
                // button.disabled = false;
            }
        });
    }
    
    function showThought(message, duration = 2200, type = 'neutral') {
        nyamaThoughtBubble.textContent = message;
        nyamaThoughtBubble.className = 'thought-bubble show'; // タイプ別クラスはCSSで定義
        if (type === 'success') nyamaThoughtBubble.classList.add('success');
        else if (type === 'failure') nyamaThoughtBubble.classList.add('failure');
        else if (type === 'shiro') nyamaThoughtBubble.classList.add('shiro'); // しろちゃん用
        
        setTimeout(() => {
            nyamaThoughtBubble.classList.remove('show', 'success', 'failure', 'shiro');
        }, duration);
    }

    // --- Item Definitions (大幅に簡略化・変更) ---
    const ITEMS = { // これから具体的に定義
        'textbook_nietzsche': {
            name: 'ニーチェ『ツァラトゥストラ』', price: 150 * (gameState.difficultySettings?.resourceFactor || 1), type: 'consumable_active',
            description: '読むと一時的に哲学力が上がり、正気度が少し回復するが、難解なので睡眠負債が増える。',
            use: (gs, lh) => {
                gs.philosophy += getRandomInt(5, 10);
                gs.sanity += getRandomInt(3, 7);
                gs.sleepDebt += getRandomInt(5, 8);
                lh.add(`${ITEMS.textbook_nietzsche.name}を読んだ。思考が深まる...だが少し眠い。`);
                return true;
            }
        },
        'energy_drink_unknown': {
            name: '怪しげなエナドリ', price: 200 * (gameState.difficultySettings?.resourceFactor || 1), type: 'consumable_active',
            description: '一時的にHPとSanityを回復し、睡眠負債を軽減するが、後で副作用があるかもしれない。',
            use: (gs, lh) => {
                gs.hp += getRandomInt(10,20);
                gs.sanity += getRandomInt(5,10);
                gs.sleepDebt -= getRandomInt(10,20);
                lh.add(`怪しげなエナジードリンクを飲んだ。一時的に覚醒！`);
                // TODO: 副作用イベントのトリガー
                return true;
            }
        }
        // 他のアイテムも同様に追加
    };
    function updateInventoryList() { /* インベントリ表示関数はほぼ元のままでOK、アイテムIDとデータ構造だけ注意 */
        inventoryListElem.innerHTML = '';
        const items = gameState.inventory.filter(inv => ITEMS[inv.id]);
        if (items.length === 0) {
            inventoryListElem.innerHTML = '<li class="no-items">なし</li>';
        } else {
            items.forEach(invItem => { // invからinvItemに変更
                const itemDef = ITEMS[invItem.id];
                if (!itemDef) return;
                const li = document.createElement('li');
                li.innerHTML = `<span class="item-name-qty">${itemDef.name} <span class="item-quantity">(x${invItem.quantity})</span></span>
                                ${itemDef.type === 'consumable_active' ? `<button class="use-item-button" data-item-id="${invItem.id}">使用</button>` : ''}`;
                inventoryListElem.appendChild(li);
            });
            document.querySelectorAll('.use-item-button').forEach(button => {
                button.addEventListener('click', (e) => useItem(e.target.dataset.itemId, e.target.closest('li')));
            });
        }
    }
    function populateShop() { /* ショップ表示関数も大きな変更は不要。アイテムデータを差し替える */
        itemShopListElem.innerHTML = '';
        shopMoneyDisplay.textContent = Math.round(gameState.money);
        for (const id in ITEMS) { // 仮で全アイテム表示
            const item = ITEMS[id];
            if (item.price === undefined) continue; // 価格未設定のアイテムはショップに表示しない

            const card = document.createElement('div');
            card.className = 'item-card';
            // ... (元のpopulateShopのカード生成ロジックを流用)
            let isButtonDisabled = false;
            let buttonText = "購入";
            const canAfford = gameState.money >= item.price;

            if (!canAfford) isButtonDisabled = true;
            // 永続アイテムの購入済み判定は今後

            card.innerHTML = `
                <h4><i class="fas fa-star"></i> ${item.name}</h4>
                <p>${item.description}</p>
                <p class="item-price"><i class="fas fa-coins"></i> ${item.price}円</p>
                <button class="button-primary buy-item-button" data-item-id="${id}" ${isButtonDisabled ? 'disabled' : ''}>
                    <i class="fas fa-shopping-cart"></i> ${buttonText}
                </button>
            `;
            itemShopListElem.appendChild(card);
        }
        document.querySelectorAll('.buy-item-button').forEach(button =>
            button.addEventListener('click', () => buyItem(button.dataset.itemId))
        );
    }
    function buyItem(itemId) { /* アイテム購入ロジックも大きな変更は不要。アイテム効果はuseで発動 */
        const itemDef = ITEMS[itemId];
        if (!itemDef || itemDef.price === undefined) return;
        // 永続アイテム判定は今後
        if (gameState.money < itemDef.price) {
            showThought("活動資金が足りない…", 1800, 'failure');
            return;
        }
        gameState.money -= itemDef.price;
        LogHelper.add(`--- アイテム購入 ---`);
        LogHelper.add(`${itemDef.name}を${itemDef.price}円で購入。`);

        const existingItem = gameState.inventory.find(i => i.id === itemId);
        if (existingItem) {
            existingItem.quantity++;
        } else {
            gameState.inventory.push({ id: itemId, name: itemDef.name, quantity: 1 });
        }
        showThought(`${itemDef.name}を入手！`, 1800, 'success');
        updateMainUI(); // インベントリと資金を即時更新
        populateShop(); // ショップ内の購入ボタン状態も更新
    }
    function useItem(itemId, itemElement) { /* アイテム使用ロジック */
        const itemIndex = gameState.inventory.findIndex(i => i.id === itemId && i.quantity > 0);
        if (itemIndex === -1) {
            showThought("そのアイテムは持っていないか、もう無い。", 1800, 'failure');
            return;
        }
        const itemDef = ITEMS[itemId];
        if (!itemDef || typeof itemDef.use !== 'function') {
            showThought("このアイテムはここでは使えないようだ。", 1800, 'failure');
            return;
        }

        LogHelper.add(`--- アイテム使用: ${itemDef.name} ---`);
        const success = itemDef.use(gameState, LogHelper); // gameState と LogHelper を渡す

        if (success) {
            gameState.inventory[itemIndex].quantity--;
            if (gameState.inventory[itemIndex].quantity <= 0) {
                gameState.inventory.splice(itemIndex, 1);
            }
            if (itemElement) { // UIフィードバック
                itemElement.classList.add('item-used-flash'); // CSSで定義する
                setTimeout(() => itemElement.classList.remove('item-used-flash'), 700);
            }
            showThought(`${itemDef.name}を使った！`, 1800, 'success');
        } else {
            // 使用失敗時の処理 (アイテム定義側でメッセージを出すことが多い)
            showThought(`${itemDef.name}の使用に失敗した…`, 1800, 'failure');
        }
        updateMainUI(); // パラメータとインベントリを更新
    }


    // --- Random Events (大幅に簡略化・変更) ---
    const RANDOM_EVENTS = [ // これから具体的に定義
        {
            name: "ADHDの衝動",
            msg: "突然、全く関係ないことを閃き、時間を浪費してしまった！",
            canTrigger: (gs) => gs.sanity < 60 && Math.random() < 0.2 * (gs.difficultySettings.eventSeverityFactor || 1), // 発生条件
            effect: (gs, lh) => {
                lh.add("ADHDの衝動！Sanityが少し減少し、貴重な時間を失った。");
                gs.sanity -= getRandomInt(3, 7) * (gs.difficultySettings.stressFactor || 1);
                // 時間消費の概念はまだないので、何らかのペナルティ
            }
        },
        {
            name: "しろちゃんからのDM",
            msg: "しろちゃんから煽りDMが来た！どうする？",
            canTrigger: (gs) => gs.shiroHate > 30 && Math.random() < 0.3 * (gs.difficultySettings.eventSeverityFactor || 1),
            effect: (gs, lh) => { // 本来は選択肢イベント
                lh.add("しろちゃんからDM！Sanityが揺らぐ！");
                gs.sanity -= getRandomInt(5, 10) * (gs.difficultySettings.stressFactor || 1) * (gs.difficultySettings.shiroAggression || 1);
                gs.shiroHate += getRandomInt(3,8);
                showThought("またアイツか…！", 2000, 'shiro');
            }
        }
    ];
    function triggerRandomEvent() {
        eventNotificationArea.style.display = 'none';
        for (const eventDef of RANDOM_EVENTS) {
            if (eventDef.canTrigger(gameState)) {
                eventMessageElem.innerHTML = `<strong>イベント発生！</strong> ${eventDef.msg}`;
                eventNotificationArea.style.display = 'block';
                // gameContainer.classList.add('event-flash-highlight'); // CSSで定義
                // setTimeout(() => gameContainer.classList.remove('event-flash-highlight'), 1500);
                
                LogHelper.add(`--- ランダムイベント: ${eventDef.name} ---`, 'event');
                eventDef.effect(gameState, LogHelper);
                showThought(`「${eventDef.name}」発生！`, 3200, 'neutral'); // タイプはイベントに応じて
                updateMainUI(); // イベント結果を即時反映
                return true; // 1日に1イベントまで
            }
        }
        return false;
    }


    // --- Action Functions (新しい行動に合わせて変更、中身は仮) ---
    function studyPhilosophicalTexts() {
        LogHelper.add("<strong><i class='fas fa-book'></i> 哲学書を読み、思索に耽った。</strong>", "action");
        // ADHD特性: 集中できないことがある (確率で効果半減など)
        let concentrationRoll = Math.random();
        let adhdPenalty = 1.0;
        if (concentrationRoll < 0.3 * (gameState.difficultySettings.adhdPenaltyFactor || 1) && gameState.sleepDebt > 30) { // 睡眠不足で悪化
            LogHelper.add("ADHDの特性か、なかなか集中できない…");
            adhdPenalty = 0.5;
        }

        gameState.philosophy += Math.round(getRandomInt(3, 7) * adhdPenalty * (1 / (gameState.difficultySettings.stressFactor || 1))); // 難易度で哲学獲得量も変動
        gameState.sanity += Math.round(getRandomInt(1, 4) * adhdPenalty);
        gameState.sleepDebt += getRandomInt(5, 10);
        gameState.hp -= getRandomInt(1,3); // 微妙に疲れる
        showThought(adhdPenalty < 1.0 ? "頭が働かない…" : "我、思索す…", 2000, adhdPenalty < 1.0 ? 'failure' : 'neutral');
    }

    function goToUniversity() {
        LogHelper.add("<strong><i class='fas fa-university'></i> 大学へ向かった。</strong>", "action");
        gameState.money -= Math.round(100 * (gameState.difficultySettings.resourceFactor || 1)); // 交通費
        gameState.philosophy += getRandomInt(1, 3);
        gameState.sleepDebt += getRandomInt(2, 5);
        gameState.hp -= getRandomInt(3,6);
        // TODO: しろちゃん遭遇イベント、講義集中できないイベント
        showThought("今日の講義は退屈だったな…", 2000, 'neutral');
    }

    function engageShiroOnSNS() { // これがメインの作り込み対象の一つ
        LogHelper.add("<strong><i class='fab fa-twitter'></i> しろカスに一言物申すか…</strong>", "action");
        // しろちゃんヘイト、Sanity、Philosophyなどが複雑に絡む
        // 選択肢ベースのミニゲームにする予定
        let battleOutcome = Math.random(); // 仮の勝敗判定
        if (battleOutcome < 0.4 - (gameState.philosophy / 200) + (gameState.shiroHate / 300) ) { // 哲学低い、ヘイト高いと負けやすい
            LogHelper.add("しろちゃんに言い負かされた…！屈辱だ！");
            gameState.sanity -= getRandomInt(10, 20) * (gameState.difficultySettings.stressFactor || 1) * (gameState.difficultySettings.shiroAggression || 1);
            gameState.shiroHate += getRandomInt(5,10);
            showThought("ぐぬぬ…覚えてろよ！", 2200, 'failure');
        } else {
            LogHelper.add("しろちゃんを論破！少しスッキリした。");
            gameState.sanity += getRandomInt(5, 15);
            gameState.shiroHate = Math.max(0, gameState.shiroHate - getRandomInt(3,8));
            gameState.philosophy += 1; // 論争経験
            showThought("ふん、雑魚め！", 2000, 'success');
        }
        gameState.sleepDebt += getRandomInt(3,6); // 夜更かししてレスバ
    }

    function doPartTimeJob() {
        LogHelper.add("<strong><i class='fas fa-briefcase'></i> 短期バイトに励んだ。</strong>", "action");
        // ADHD特性: ミスして報酬減額の可能性
        let adhdMistake = Math.random() < 0.2 * (gameState.difficultySettings.adhdPenaltyFactor || 1);
        let earnings = getRandomInt(1000, 3000) * (gameState.difficultySettings.resourceFactor || 1);
        if (adhdMistake) {
            LogHelper.add("うっかりミスをしてしまい、報酬が減額された…");
            earnings *= 0.5;
        }
        gameState.money += Math.round(earnings);
        gameState.hp -= getRandomInt(10, 20);
        gameState.sanity -= getRandomInt(3, 7);
        gameState.sleepDebt += getRandomInt(8, 15);
        showThought(adhdMistake ? "またやっちゃった…" : "これで食いつなげる…", 2000, adhdMistake ? 'failure' : 'neutral');
    }

    function selfAffirmationTime() {
        LogHelper.add("<strong><i class='fas fa-hat-wizard'></i> \"天才\"的自己分析を行った。</strong>", "action");
        gameState.sanity += getRandomInt(10, 20) * (1 / (gameState.difficultySettings.stressFactor || 1));
        gameState.philosophy += getRandomInt(1,3);
        // 稀に万能感が暴走するイベントトリガー
        showThought("やはり私は天才だ…！", 1800, 'success');
    }

    function tryToRest() {
        LogHelper.add("<strong><i class='fas fa-moon'></i> シェルターで休息を試みた。</strong>", "action");
        // 睡眠障害: うまく眠れないことがある
        let sleepQuality = Math.random();
        let recoveryFactor = 1.0 * (gameState.difficultySettings.sleepRecoveryFactor || 1);
        if (sleepQuality < 0.4 && gameState.sanity < 40) { // 正気度低いと悪夢見やすい
            LogHelper.add("悪夢にうなされ、あまり休めなかった…");
            recoveryFactor = 0.3;
            gameState.sanity -= getRandomInt(3,8);
        }
        gameState.hp += Math.round(getRandomInt(15, 30) * recoveryFactor);
        gameState.sleepDebt -= Math.round(getRandomInt(20, 40) * recoveryFactor);
        // 食料・水消費の概念はまだない
        showThought(recoveryFactor < 0.5 ? "全然寝付けない…" : "少しはマシになったか…", 2000, recoveryFactor < 0.5 ? 'failure' : 'neutral');
    }

    function seekMedication() {
        LogHelper.add("<strong><i class='fas fa-pills'></i> 薬を探すか、手持ちの薬を飲んだ。</strong>", "action");
        // アイテムがあるかどうかで分岐、または闇市で買うイベントなど
        // 仮: Sanityを少し回復、SleepDebtを少し回復、副作用でHP微減
        if (gameState.inventory.find(i => i.id === 'sleeping_pills_strong')) { // 仮のアイテム
             LogHelper.add("強力な睡眠薬を飲んだ。");
             gameState.sleepDebt -= getRandomInt(30,50);
             gameState.sanity -= getRandomInt(3,6); // 副作用
             gameState.hp -= getRandomInt(1,4);
             showThought("これで眠れる…はず…", 2000, 'neutral');
             // TODO: アイテム消費ロジック
        } else {
            LogHelper.add("薬は見つからなかったか、飲むのをためらった。");
            gameState.sanity -= getRandomInt(1,5); // 不安
            showThought("薬がないと不安だ…", 2000, 'failure');
        }
    }


    // --- Game Flow Functions ---
    function endDay() {
        // 日付更新、パラメータ自然変動など
        // gameState.omikujiUsedToday = false; // にゃまチャレンジでは不要
        // gameState.quizAttemptedToday = false; // デイリークイズは未実装

        gameState.day++;
        // applyActiveEffectsEndOfDay(); // 将来的に実装

        // パラメータ自然変動 (睡眠負債による影響など)
        gameState.sanity -= Math.floor(gameState.sleepDebt / 20) * (gameState.difficultySettings.stressFactor || 1); // 睡眠不足で正気度低下
        gameState.hp -= Math.floor(gameState.sleepDebt / 25);     // 睡眠不足でHP低下
        gameState.sleepDebt += getRandomInt(2,5); // 何もしなくても少しずつ睡眠負債はたまる

        // しろちゃんヘイトによる微細なストレス (仮)
        if(gameState.shiroHate > 50) {
            gameState.sanity -= getRandomInt(0,2) * (gameState.difficultySettings.stressFactor || 1);
        }


        LogHelper.commitCurrentTurnToGameState(`--- ${gameState.day - 1}日目の終わり ---`);

        if (gameState.hp <= 0) {
            triggerImmediateGameOver({
                title: "力尽きる",
                message: "HPが尽き、にゃまは活動を停止した…。ディストピアの片隅で、石ころのように動かなくなった。",
                nyamaImageSrc: gameState.nyamaEndingImageBase + '_death_hp.png' // 仮
            });
            return;
        }
        if (gameState.sanity <= 0) {
            triggerImmediateGameOver({
                title: "精神崩壊",
                message: "正気度が失われ、にゃまの精神は完全に崩壊した。もはや彼女が何を考えているのか、誰にも分からない。",
                nyamaImageSrc: gameState.nyamaEndingImageBase + '_death_sanity.png' // 仮
            });
            return;
        }


        if (gameState.day > maxDaysGlobal) {
            evaluateEnding();
        } else {
            triggerRandomEvent(); // 確率でランダムイベント発生
            const newDayPrompt = `<br><br>--- ${gameState.day}日目 ---<br>今日もまた、終わらない日常が始まる…。終末まであと${maxDaysGlobal - gameState.day + 1}日。`;
            LogHelper.commitCurrentTurnToGameState(newDayPrompt);
            updateMainUI();
            enableActions();
        }
    }

    function evaluateEnding() { // 元 triggerExam
        disableActions();
        endingModal.classList.add('show');
        endingCalcMsg.style.display = 'block'; // ローディング表示
        endingActualResult.style.display = 'none';

        LogHelper.addRaw("<strong><i class='fas fa-hourglass-end'></i> 運命の15日目が終わった…にゃまの行く末は？</strong>");
        LogHelper.commitCurrentTurnToGameState();
        updateMainUI(); // ログを最終更新

        setTimeout(() => {
            // ここで複雑なエンディング分岐ロジックを実装
            let msg = "";
            let title = "15日間の結末";
            let endImg = gameState.nyamaImage; // 基本画像

            // 仮のエンディング分岐
            if (gameState.philosophy > 70 && gameState.sanity > 60) {
                title = "哲学の境地エンド";
                msg = "にゃまは15日間を生き延び、独自の哲学的境地に達した。世界の真理は石ころの中にこそ在るのかもしれない…。";
                endImg = gameState.nyamaEndingImageBase + '_philosopher.png'; // 仮
            } else if (gameState.shiroHate < 10 && gameState.sanity > 50) {
                title = "しろちゃん和解(?)エンド";
                msg = "不思議なことに、しろちゃんとの関係は改善した。あるいは、単に飽きられただけかもしれない。平穏な日常が戻る…のか？";
                endImg = gameState.nyamaEndingImageBase + '_peace.png'; // 仮
            } else {
                title = "日常継続エンド（仮）";
                msg = "にゃまはなんとか15日間を乗り切った。だが、彼女の戦いはまだ終わらないのかもしれない…。";
                endImg = gameState.nyamaEndingImageBase + '_survival.png'; // 仮
            }

            endingTitle.textContent = title;
            endingResultMessage.innerHTML = msg; // innerHTMLで装飾も可能
            endingNyamaImageElem.src = endImg;

            endingCalcMsg.style.display = 'none';
            endingActualResult.style.display = 'block';
            // エンディングごとの派手な演出はここに追加
        }, 2800);
    }

    function triggerImmediateGameOver(details) {
        disableActions();
        endingModal.classList.add('show');
        endingTitle.textContent = details.title || "ゲームオーバー";
        endingTitle.style.color = 'var(--color-danger)'; // 仮の色
        endingNyamaImageElem.src = details.nyamaImageSrc || gameState.nyamaSadImage;
        endingResultMessage.innerHTML = details.message || "何かが起こり、物語はここで終わった…。";
        endingCalcMsg.style.display = 'none';
        endingActualResult.style.display = 'block';
        // 派手なゲームオーバー演出もここに追加
    }


    let actionButtonsCurrentlyDisabled = false;
    function disableActions() {
        actionButtonsCurrentlyDisabled = true;
        actionButtonsNodeList.forEach(b => b.disabled = true);
        if (openShopButton) openShopButton.disabled = true;
        // 他の操作不能にしたいボタンもここで無効化
    }
    function enableActions() {
        actionButtonsCurrentlyDisabled = false;
        if (gameState.day <= maxDaysGlobal && gameState.hp > 0 && gameState.sanity > 0) {
            actionButtonsNodeList.forEach(b => b.disabled = false);
            if (openShopButton) openShopButton.disabled = false;
        } else {
            disableActions(); // ゲーム続行不可なら無効のまま
        }
    }


    function handleAction(actionType) {
        if (gameState.day > maxDaysGlobal || actionButtonsCurrentlyDisabled) return;

        if (gameState.hp <= 0 && actionType !== 'try_to_rest' /*など一部例外を除き*/) {
             LogHelper.add("HPがゼロだ…もう何もできない…。", "error");
             LogHelper.commitCurrentTurnToGameState(`--- ${gameState.day}日目の行動 ---`);
             showThought("意識が…遠のく……", 2000, 'failure');
             // 即座にゲームオーバー処理をしても良い
             triggerImmediateGameOver({ title: "衰弱死", message: "HPが尽き、にゃまは静かに石となった…。", nyamaImageSrc: gameState.nyamaEndingImageBase + "_hp_zero.png"});
             return;
        }
        if (gameState.sanity <= 0) {
            LogHelper.add("正気度がゼロだ…まともな判断ができない…。", "error");
            // triggerImmediateGameOver({ title: "発狂", message: "...", nyamaImageSrc: ...});
            // return; // 発狂状態での行動制限などを入れても良い
        }


        disableActions(); // 行動開始時に一旦無効化
        LogHelper.clearCurrentTurnLogs(); // 前のターンの行動ログをクリア

        switch (actionType) {
            case 'study_philosophy': studyPhilosophicalTexts(); break;
            case 'go_to_university': goToUniversity(); break;
            case 'engage_shiro': engageShiroOnSNS(); break;
            case 'do_part_time_job': doPartTimeJob(); break;
            case 'self_affirmation': selfAffirmationTime(); break;
            case 'try_to_rest': tryToRest(); break;
            case 'seek_medication': seekMedication(); break;
            default:
                console.error("未定義のアクション(handleAction):", actionType);
                enableActions(); // 未定義なら再度有効化
                return;
        }
        LogHelper.commitCurrentTurnToGameState(`--- ${gameState.day}日目の行動 ---`);
        updateMainUI(); // 行動結果をUIに反映

        // endDayを少し遅延させて、行動結果のログや思考バブルを見せる時間を作る
        setTimeout(() => {
            if (gameState.day <= maxDaysGlobal && gameState.hp > 0 && gameState.sanity > 0) { // ゲームオーバー状態でなければ
                endDay();
            } else if(!endingModal.classList.contains('show')) { // まだエンディング表示中でなければ
                // HP/SanityゼロによるゲームオーバーはendDay内で処理される想定だが、念のため
                 if (gameState.hp <= 0) triggerImmediateGameOver({ title: "衰弱死", message: "HPが尽き、にゃまは静かに石となった…。", nyamaImageSrc: gameState.nyamaEndingImageBase + "_hp_zero.png"});
                 else if (gameState.sanity <= 0) triggerImmediateGameOver({ title: "精神崩壊", message: "正気度が失われ、にゃまの精神は完全に崩壊した。", nyamaImageSrc: gameState.nyamaEndingImageBase + "_death_sanity.png"});
            }
        }, 1300); // 1.3秒後
    }

    // --- Game Initialization ---
    function initializeGame(difficultyKey) {
        maxDaysGlobal = 15;
        gameState = JSON.parse(JSON.stringify(INITIAL_STATE_BASE));

        if (DIFFICULTY_PRESETS[difficultyKey]) {
            gameState.difficultySettings = JSON.parse(JSON.stringify(DIFFICULTY_PRESETS[difficultyKey]));
        } else {
            console.warn(`Difficulty key "${difficultyKey}" not found. Defaulting to normal.`);
            gameState.difficultySettings = JSON.parse(JSON.stringify(DIFFICULTY_PRESETS.normal));
        }
        
        // 難易度に応じた初期値調整
        gameState.money = Math.round(INITIAL_STATE_BASE.money * (gameState.difficultySettings.resourceFactor || 1.0));
        gameState.philosophy = INITIAL_STATE_BASE.philosophy; // 哲学は初期値固定でも良い
        // 他の初期パラメータも難易度で調整するならここ

        difficultyScreen.style.display = 'none';
        difficultyScreen.classList.add('hidden');
        gameContainer.style.display = 'block';
        gameContainer.classList.remove('hidden');
        
        LogHelper.resetFullLog();
        LogHelper.setInitialLogMessage(`にゃまの15日間の戦いが始まる…。選択難易度: ${gameState.difficultySettings.name}`);
        
        endingModal.classList.remove('show'); // 前回のエンディングモーダルを隠す
        updateMainUI();
        enableActions();
        eventNotificationArea.style.display = 'none';
    }

    // --- Event Listeners ---
    document.querySelectorAll('.button-difficulty').forEach(button => {
        button.addEventListener('click', () => initializeGame(button.dataset.difficulty));
    });

    actionButtonsNodeList.forEach(button => {
        button.addEventListener('click', () => {
            if (!actionButtonsCurrentlyDisabled) {
                handleAction(button.dataset.action);
            }
        });
    });

    restartGameButton.addEventListener('click', () => {
        endingModal.classList.remove('show');
        gameContainer.style.display = 'none'; gameContainer.classList.add('hidden');
        difficultyScreen.style.display = 'flex'; difficultyScreen.classList.remove('hidden');
    });

    openShopButton.addEventListener('click', () => { populateShop(); itemShopModal.classList.add('show'); });
    modalCloseButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const modalId = e.target.dataset.modalId;
            if(modalId) {
                const modalToClose = document.getElementById(modalId);
                if(modalToClose && modalId !== 'ending-modal') { // エンディングモーダルはXでは閉じないようにする（リスタートのみ）
                    modalToClose.classList.remove('show');
                }
            }
        });
    });
    // モーダル背景クリックで閉じる処理も、エンディングモーダルは除外した方が良いかも

    // --- Initial Game Setup ---
    function gameStartInit() {
        // await loadQuizData(); // クイズは未実装なのでコメントアウト
        gameContainer.style.display = 'none';
        gameContainer.classList.add('hidden');
        difficultyScreen.style.display = 'flex';
        difficultyScreen.classList.remove('hidden');
        console.log("にゃまチャレンジ Ver.0.1 (WIP)");
    }

    gameStartInit();
});
