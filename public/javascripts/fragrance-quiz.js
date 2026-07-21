/* Fragrance quiz — a short set of vibe-based questions, scored against
   scent-family tags, matched to the closest fragrance in the catalog.
   Requires window.FRAGRANCE_CATALOG (set by views/fragrance-quiz.ejs),
   an array of { id, name, brand, description, price, effectivePrice,
   onSale, discountPercent, image, emoji, tone, scentFamily }. */
(function () {
  'use strict';

  var B = window.Beautique;
  var quizCard = B.$('#quiz-card');
  if (!quizCard) return;

  var FRAGRANCES = window.FRAGRANCE_CATALOG || [];

  var FAMILY_LABELS = {
    floral: 'Floral',
    woody: 'Woody',
    citrus: 'Citrus',
    amber: 'Amber & Spice',
    fresh: 'Fresh & Aquatic',
    gourmand: 'Gourmand & Sweet'
  };

  /* Each answer nudges one or two scent families — the quiz's whole "model"
     is just this table. Add a question or tweak the tags here to change
     how it scores; no other code needs to change. */
  var QUESTIONS = [
    {
      text: 'Pick your dream weekend getaway',
      options: [
        { label: 'A beach with salty air', tags: ['fresh', 'citrus'] },
        { label: 'A cabin deep in the woods', tags: ['woody'] },
        { label: 'A rose garden in full bloom', tags: ['floral'] },
        { label: 'A cozy café with dessert on the table', tags: ['gourmand'] }
      ]
    },
    {
      text: 'Choose a fabric that feels like "you"',
      options: [
        { label: 'Crisp linen', tags: ['fresh', 'citrus'] },
        { label: 'Warm suede', tags: ['woody', 'amber'] },
        { label: 'Soft silk', tags: ['floral'] },
        { label: 'Plush velvet', tags: ['amber', 'gourmand'] }
      ]
    },
    {
      text: 'What time of day do you feel most yourself?',
      options: [
        { label: 'Early morning', tags: ['citrus', 'fresh'] },
        { label: 'Golden hour', tags: ['floral'] },
        { label: 'Late night', tags: ['amber', 'woody'] }
      ]
    },
    {
      text: 'Pick a treat',
      options: [
        { label: 'Fresh citrus fruit', tags: ['citrus'] },
        { label: 'A vanilla bean dessert', tags: ['gourmand'] },
        { label: 'Warm spiced tea', tags: ['amber'] },
        { label: 'A bouquet of fresh flowers', tags: ['floral'] }
      ]
    },
    {
      text: 'One word for your vibe?',
      options: [
        { label: 'Romantic', tags: ['floral'] },
        { label: 'Bold', tags: ['amber', 'woody'] },
        { label: 'Playful', tags: ['citrus', 'fresh'] },
        { label: 'Cozy', tags: ['gourmand', 'amber'] }
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
    if (!FRAGRANCES.length) {
      quizCard.innerHTML = '<div class="empty-state" style="padding: 40px 10px;">' +
        '<span class="empty-emoji">' + window.BeautiqueIcons.perfume + '</span>' +
        '<h3>No fragrances available</h3><p>Add a fragrance product (with a scent family) in the admin panel first.</p></div>';
      return;
    }

    // Match score = average of the quiz's points for each of this
    // fragrance's tags — averaging (not summing) so a fragrance tagged
    // with 3 families isn't unfairly favored over one tagged with 1.
    var ranked = FRAGRANCES.map(function (f) {
      var tags = f.scentFamily || [];
      var matchScore = tags.length
        ? tags.reduce(function (sum, tag) { return sum + (scores[tag] || 0); }, 0) / tags.length
        : 0;
      return Object.assign({}, f, { matchScore: matchScore });
    }).sort(function (a, b) { return b.matchScore - a.matchScore; });

    var top = ranked[0];
    var topFamilies = Object.keys(scores)
      .filter(function (tag) { return scores[tag] > 0; })
      .sort(function (a, b) { return scores[b] - scores[a]; })
      .slice(0, 2)
      .map(function (tag) { return FAMILY_LABELS[tag] || tag; });

    var art = top.image
      ? '<img class="art-photo" src="' + top.image + '" alt="' + B.escapeHtml(top.name) + '">'
      : '<span class="art-emoji">' + (top.emoji || window.BeautiqueIcons.perfume) + '</span>';

    var priceHtml = top.onSale
      ? '<span class="price-original">' + B.money(top.price) + '</span> <span class="price price-sale">' + B.money(top.effectivePrice) + '</span> <span class="badge-sale">-' + top.discountPercent + '%</span>'
      : '<span class="price">' + B.money(top.price) + '</span>';

    quizCard.innerHTML =
      '<div class="quiz-result">' +
        '<span class="eyebrow">Your scent profile: ' + B.escapeHtml(topFamilies.join(' & ') || 'Eclectic') + '</span>' +
        '<h3 style="font-size: 26px;">' + B.escapeHtml(top.name) + '</h3>' +
        '<div class="product-art quiz-result-art" style="--tone:' + (Number(top.tone) || 340) + ';">' + art + '</div>' +
        '<p class="text-muted">' + B.escapeHtml(top.description || '') + '</p>' +
        '<div class="quiz-result-price">' + priceHtml + '</div>' +
        '<div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-top:14px;">' +
          '<a class="btn btn-primary" href="/product/' + top.id + '">Shop this scent</a>' +
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
