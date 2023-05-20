// ==UserScript==
// @name         WaniKani Do You Even Kana? (ModAnswerChecker register)
// @namespace    http://www.wanikani.com
// @version      1.0.0
// @description  Check that the okurigana matches the answer
// @author       polv
// @match        https://www.wanikani.com/extra_study/session*
// @match        https://www.wanikani.com/review/session*
// @match        https://www.wanikani.com/subjects/*
// @match        https://preview.wanikani.com/extra_study/session*
// @match        https://preview.wanikani.com/review/session*
// @match        https://preview.wanikani.com/subjects/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=wanikani.com
// @license      MIT
// @homepage     https://greasyfork.org/en/scripts/465750-wanikani-please-check-spelling
// @supportURL   https://community.wanikani.com/t/userscript-plz-check-spelling-no-cigar-but-accept-plural-and-no-space-variants/61763
// @source       https://github.com/patarapolw/wanikani-userscript/blob/master/userscripts/plz-check-spelling.user.js
// @grant        none
// ==/UserScript==

// @ts-check
(function () {
  'use strict';

  /** @typedef {'whitelist' | 'blacklist' | 'warning'} AuxiliaryType */

  /**
   * @typedef {{
   *   questionType: string
   *   item: {
   *     type: string
   *     characters: string
   *     readings?: string[]
   *     auxiliary_readings?: {
   *       reading: string
   *       type: AuxiliaryType
   *     }[]
   *     meanings: string[]
   *     auxiliary_meanings: {
   *       meaning: string
   *       type: AuxiliaryType
   *     }[]
   *   }
   *   userSynonyms: string[]
   *   response: string
   * }} EvaluationParam
   */

  /**
   * @typedef {{
   *   action: 'pass' | 'fail' | 'retry'
   *   message: null | {
   *     text: string
   *     type: 'itemInfoException' | 'answerException'
   *   }
   * }} Evaluation
   */

  /** @typedef {((e: EvaluationParam) => Evaluation)} EvaluationFunction */
  /** @typedef {((e: EvaluationParam, check: EvaluationFunction) => Evaluation | null)} TryEvaluationFunction */

  class ModAnswerChecker {
    /**
     * @type {TryEvaluationFunction[]}
     */
    mods = [];

    /**
     *
     * @param {TryEvaluationFunction} fn
     */
    register(fn) {
      this.mods.push(fn);
    }

    constructor() {
      // Automatically init on new instance
      this.init();
    }

    async init() {
      const answerChecker = await this.getAnswerChecker(60000);

      answerChecker.oldEvaluate = answerChecker.evaluate.bind(answerChecker);

      /** @type {(fns: TryEvaluationFunction[]) => EvaluationFunction} */
      const evaluateWith = (fns) => {
        return (e) => {
          for (const fn of fns) {
            const r = fn(e, evaluateWith(fns.filter((it) => it !== fn)));
            if (r) return r;
          }
          return answerChecker.oldEvaluate(e);
        };
      };

      answerChecker.evaluate = evaluateWith(this.mods);
    }

    /**
     * Get answerChecker Object
     * @param {number} timeout
     * @returns {Promise<{
     *   oldEvaluate: EvaluationFunction
     *   evaluate: EvaluationFunction
     * }>}
     */
    async getAnswerChecker(timeout) {
      //Stimulus.controllers.filter((x)=>{return x.answerChecker;})[0]
      const start = Date.now();

      function waitForAnswerChecker(resolve, reject) {
        // @ts-ignore
        const Stimulus = window.Stimulus;
        if (
          Stimulus &&
          Stimulus.controllers.filter((x) => {
            return x.answerChecker;
          })[0]
        ) {
          var answerChecker = Stimulus.controllers.filter((x) => {
            return x.answerChecker;
          })[0].answerChecker;
          resolve(answerChecker);
        } else if (timeout && Date.now() - start >= timeout)
          reject(new Error('timeout'));
        else setTimeout(waitForAnswerChecker.bind(this, resolve, reject), 30);
      }

      return new Promise(waitForAnswerChecker);
    }
  }

  // @ts-ignore
  window.modAnswerChecker = window.modAnswerChecker || new ModAnswerChecker();
  /** @type {ModAnswerChecker} */
  // @ts-ignore
  const modAnswerChecker = window.modAnswerChecker;

  //////////////////////////////////////////////////////////////////////////////

  /**
   * !Okurigana Matcher section
   * @see https://community.wanikani.com/t/do-you-even-kana-okurigana-matcher/8440
   */
  modAnswerChecker.register((e) => {
    if (e.questionType === 'reading' && e.item.type === 'Vocabulary') {
      if (!makeRegex(e.item.characters).test(e.response.trim())) {
        return {
          action: 'retry',
          message: {
            text: 'Bro, Do you even Kana?',
            type: 'answerException',
          },
        };
      }
    }
    return null;
  });

  //Create regex profiles (katakana matches need hiragana counterparts included)
  /** Prepends Hiragana counterpart to any Katakana string input
   * @param {String} char - A one character long string that may be a Katakana character
   * @returns {String} A single character if the input is Hiragana or "ー"; A two character string of (hopefully) Hiragana-Katakana pairs in square brackets (that can form a regex) if not.
   * @bug Will attempt to pair any character that is not Hiragana or "ー"
   */
  function pairKatakana(char) {
    if (/^[\u3040-\u309fー]$/.test(char)) {
      //is char hiragana or "ー"?
      return char;
    } else {
      //set up pairs
      var offset = -6 * 16; //katakana block: 30a0-30ff
      var katakana = String.fromCharCode(char.charCodeAt(0) + offset);
      return '[' + char + katakana + ']';
    }
  }

  /** Returns true if the character is Kana
   * @param {String} char
   */
  function isKana(char) {
    return /^[\u3040-\u30ff]$/.test(char);
  }

  /** Creates regex from a vocabulary item that matches the Kana in that item.
   * @param {string} cV
   */
  function makeRegex(cV) {
    var r = '^'; //start the regex string
    for (var c = 0; c < cV.length; c++) {
      if (isKana(cV[c])) {
        r += pairKatakana(cV[c]);
      } else {
        //we have a non-kana character
        if (cV[c] !== '〜') {
          //I doubt WK will be adding Kana suffixes but just covering all the bases to be safe.
          r += '(.+)'; // unknown number of characters in reading (corresponding to kanji), capturing in groups for versatility
          while (c < cV.length && !isKana(cV[c + 1])) {
            c++; //skip non-kana characters (already have ".+" in our regex, do not need to add more)
          }
        }
      }
    }
    r += '$'; // End of regex
    return new RegExp(r);
  }
})();
