(() => {
    const MESSAGE_SOURCE = 'cognitive-suite:syllogimous';
    let activeSession = null;

    const postToSuite = (type, detail = {}) => {
        if (window.parent === window) return;
        window.parent.postMessage({ source: MESSAGE_SOURCE, type, ...detail }, '*');
    };

    const createSessionId = () => globalThis.crypto?.randomUUID?.()
        ?? `syllogimous:${Date.now()}:${Math.random().toString(36).slice(2)}`;

    const startSuiteSession = () => {
        if (activeSession) return;
        activeSession = {
            sessionId: createSessionId(),
            startedAt: Date.now(),
            correctCount: 0,
            totalAnswers: 0,
            totalResponseTimeMs: 0,
            totalPremises: 0,
            categoryCounts: {},
        };
        postToSuite('active-change', { active: true });
    };

    const trackCompletedQuestion = () => {
        if (!activeSession || !question) return;
        const responseTimeMs = Number(question.answeredAt) - Number(question.startedAt);
        const category = String(question.type || question.category || 'relational-reasoning').split(':')[0];
        const premiseCount = Number(question.plen) || question.premises?.length || 0;

        activeSession.totalAnswers++;
        if (question.correctness === 'right') activeSession.correctCount++;
        if (Number.isFinite(responseTimeMs) && responseTimeMs >= 0) {
            activeSession.totalResponseTimeMs += responseTimeMs;
        }
        activeSession.totalPremises += premiseCount;
        activeSession.categoryCounts[category] = (activeSession.categoryCounts[category] || 0) + 1;
    };

    const finishSuiteSession = () => {
        const session = activeSession;
        activeSession = null;
        postToSuite('active-change', { active: false });
        if (!session || session.totalAnswers === 0) return;

        const completedTimestamp = Date.now();
        const categories = Object.keys(session.categoryCounts);
        postToSuite('session-complete', {
            session: {
                sessionId: session.sessionId,
                startedAt: new Date(session.startedAt).toISOString(),
                completedAt: new Date(completedTimestamp).toISOString(),
                durationSec: Math.max(0, (completedTimestamp - session.startedAt) / 1000),
                mode: categories.length === 1 ? categories[0] : 'mixed',
                correctCount: session.correctCount,
                totalAnswers: session.totalAnswers,
                averageResponseTimeMs: session.totalResponseTimeMs / session.totalAnswers,
                averagePremises: session.totalPremises / session.totalAnswers,
                categoryCounts: session.categoryCounts,
            },
        });
    };

    const discardSuiteSession = () => {
        activeSession = null;
        postToSuite('active-change', { active: false });
    };

    const originalStoreQuestionAndSave = storeQuestionAndSave;
    storeQuestionAndSave = function () {
        originalStoreQuestionAndSave();
        trackCompletedQuestion();
    };

    const originalHandleCountDown = handleCountDown;
    handleCountDown = function () {
        const wasRunning = timerToggled;
        originalHandleCountDown();
        if (timerToggled && !wasRunning) startSuiteSession();
        if (!timerToggled && wasRunning) finishSuiteSession();
    };

    window.addEventListener('pagehide', finishSuiteSession);
    window.addEventListener('syllogimous-reset', discardSuiteSession);
    postToSuite('ready', { active: false });
})();
