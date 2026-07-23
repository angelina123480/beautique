/* Skincare quiz — a short set of goal-based questions, scored against
   skin-goal tags, matched to the closest skincare product in the catalog.
   Mirrors public/javascripts/fragrance-quiz.js structurally (same scoring
   approach), just against a different taxonomy/catalog.
   Requires window.SKINCARE_CATALOG (set by views/skincare-quiz.ejs), an
   array of { id, name, brand, description, price, effectivePrice, onSale,
   discountPercent, image, emoji, tone, skinGoals }. */
(function () {
  'use strict';

  var B = window.Beautique;
  var quizCard = B.$('#quiz-card');
  if (!quizCard) return;

  var PRODUCTS = window.SKINCARE_CATALOG || [];

  var GOAL_LABELS = {
    hydration: 'Hydration',
    'anti-aging': 'Anti-Aging & Firmness',
    glow: 'Glow & Radiance',
    soothing: 'Soothing & Sensitive',
    clarifying: 'Clarifying & Oil Control',
    brightening: 'Brightening & Even Tone'
  };

  /* Each answer nudges one skin goal — the quiz's whole "model" is just
     this table. Add a question or tweak the tags here to change how it
     scores; no other code needs to change. */
  var QUESTIONS = [
    {
      text: 'What\'s your top skin concern right now?',
      options: [
        { label: 'Fine lines & loss of firmness', tags: ['anti-aging'] },
        { label: 'Dull, tired-looking skin', tags: ['glow'] },
        { label: 'Tightness or flaky patches', tags: ['hydration'] },
        { label: 'Redness or sensitivity', tags: ['soothing'] },
        { label: 'Breakouts or excess shine', tags: ['clarifying'] }
      ]
    },
    {
      text: 'How does your skin usually feel by midday?',
      options: [
        { label: 'Tight or dry', tags: ['hydration'] },
        { label: 'Shiny, especially in the T-zone', tags: ['clarifying'] },
        { label: 'Fine, but I wish it glowed more', tags: ['glow'] },
        { label: 'Fine lines feel more noticeable', tags: ['anti-aging'] }
      ]
    },
    {
      text: 'Pick your skincare goal in one word',
      options: [
        { label: 'Firm', tags: ['anti-aging'] },
        { label: 'Radiant', tags: ['glow'] },
        { label: 'Calm', tags: ['soothing'] },
        { label: 'Even', tags: ['brightening'] },
        { label: 'Quenched', tags: ['hydration'] }
      ]
    },
    {
      text: 'What would make you repurchase a product on the spot?',
      options: [
        { label: '"My fine lines look softer"', tags: ['anti-aging'] },
        { label: '"My skin looks lit from within"', tags: ['glow'] },
        { label: '"My skin feels plump, not tight"', tags: ['hydration'] },
        { label: '"Redness calmed right down"', tags: ['soothing'] }
      ]
    },
    {
      text: 'Which skin goal matters most, long-term?',
      options: [
        { label: 'Preventing & softening fine lines', tags: ['anti-aging'] },
        { label: 'An even, brighter tone', tags: ['brightening'] },
        { label: 'Keeping breakouts under control', tags: ['clarifying'] },
        { label: 'Locking in moisture', tags: ['hydration'] }
      ]
    }
  ];

  var currentIndex = 0;
  var scores = {};

  function resetQuiz() {
    currentIndex = 0;
    scores = {};
    renderQuestion();
  }

  function renderQuestion() {
    var q = QUESTIONS[currentIndex];
    quizCard.innerHTML =
      '<div class="quiz-progress">Question ' + (currentIndex + 1) + ' of ' + QUESTIONS.length + '</div>' +
      '<div class="quiz-progress-bar"><i style="width:' + Math.round((currentIndex / QUESTIONS.length) * 100) + '%;"></i></div>' +
      '<h3 class="quiz-question">' + B.escapeHtml(q.text) + '</h3>' +
      '<div class="quiz-options">' +
        q.options.map(function (opt, i) {
          return '<button type="button" class="quiz-option" data-option-index="' + i + '">' + B.escapeHtml(opt.label) + '</button>';
        }).join('') +
      '</div>';
  }

  function renderResult() {
    if (!PRODUCTS.length) {
      quizCard.innerHTML = '<div class="empty-state" style="padding: 40px 10px;">' +
        '<span class="empty-emoji">' + window.BeautiqueIcons.droplet + '</span>' +
        '<h3>No skincare products available</h3><p>Add a skincare product (with skin goals) in the admin panel first.</p></div>';
      return;
    }

    // Match score = average of the quiz's points for each of this
    // product's tags — averaging (not summing) so a product tagged with
    // 3 goals isn't unfairly favored over one tagged with just 1.
    var ranked = PRODUCTS.map(function (p) {
      var tags = p.skinGoals || [];
      var matchScore = tags.length
        ? tags.reduce(function (sum, tag) { return sum + (scores[tag] || 0); }, 0) / tags.length
        : 0;
      return Object.assign({}, p, { matchScore: matchScore });
    }).sort(function (a, b) { return b.matchScore - a.matchScore; });

    var top = ranked[0];
    var topGoals = Object.keys(scores)
      .filter(function (tag) { return scores[tag] > 0; })
      .sort(function (a, b) { return scores[b] - scores[a]; })
      .slice(0, 2)
      .map(function (tag) { return GOAL_LABELS[tag] || tag; });

    var art = top.image
      ? '<img class="art-photo" src="' + top.image + '" alt="' + B.escapeHtml(top.name) + '">'
      : '<span class="art-emoji">' + (top.emoji || window.BeautiqueIcons.droplet) + '</span>';

    var priceHtml = top.onSale
      ? '<span class="price-original">' + B.money(top.price) + '</span> <span class="price price-sale">' + B.money(top.effectivePrice) + '</span> <span class="badge-sale">-' + top.discountPercent + '%</span>'
      : '<span class="price">' + B.money(top.price) + '</span>';

    quizCard.innerHTML =
      '<div class="quiz-result">' +
        '<span class="eyebrow">Your skin goal: ' + B.escapeHtml(topGoals.join(' & ') || 'Balanced') + '</span>' +
        '<h3 style="font-size: 26px;">' + B.escapeHtml(top.name) + '</h3>' +
        '<div class="product-art quiz-result-art' + (top.image ? ' has-photo' : '') + '" style="--tone:' + (Number(top.tone) || 340) + ';">' + art + '</div>' +
        '<p class="text-muted">' + B.escapeHtml(top.description || '') + '</p>' +
        '<div class="quiz-result-price">' + priceHtml + '</div>' +
        '<div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-top:14px;">' +
          '<a class="btn btn-primary" href="/product/' + top.id + '">Shop this product</a>' +
          '<button type="button" class="btn btn-ghost" data-retake-quiz>Retake quiz</button>' +
        '</div>' +
      '</div>';

    requestAnimationFrame(function () {
      var el = quizCard.querySelector('.quiz-result');
      if (el) el.classList.add('is-visible');
    });
  }

  quizCard.addEventListener('click', function (e) {
    var optBtn = e.target.closest('[data-option-index]');
    if (optBtn) {
      var q = QUESTIONS[currentIndex];
      var opt = q.options[Number(optBtn.getAttribute('data-option-index'))];
      opt.tags.forEach(function (tag) { scores[tag] = (scores[tag] || 0) + 1; });
      currentIndex++;
      if (currentIndex < QUESTIONS.length) {
        renderQuestion();
      } else {
        renderResult();
      }
      return;
    }

    if (e.target.closest('[data-retake-quiz]')) {
      resetQuiz();
    }
  });

  resetQuiz();
})();
