import type en from "./en";

const uk: typeof en = {
  vibe: {
    briefing: {
      sectionLabel: "Інструкції до історії",
      description: "Визначте першоджерела для змішування та задайте початкову сцену.",
      sourceTaleA: "Першоджерело A",
      sourceTaleB: "Першоджерело B",
      narrativeTone: "Тон нарративу",
      narrativeFallback: "Нарратив",
    },
    language: {
      sectionLabel: "Мова історії",
      english: "Англійська",
      ukrainian: "Українська",
      cyrillicDetected: "🇺🇦 Виявлено кириличний текст — змінити мову?",
    },
    brief: {
      sectionLabel: "Короткий опис",
      placeholder: "Опишіть початкову сцену, головного героя, місце дії та тип напруги.",
    },
    seeds: {
      loneWanderer: "Самотній мандрівник",
      darkProphecy: "Темне пророцтво",
      hiddenMonster: "Прихований монстр",
      unlikelyAllies: "Несподівані союзники",
      forbiddenArchive: "Заборонений архів",
      lastBloodline: "Остання лінія крові",
      theBetrayal: "Зрада",
      shatteredCity: "Зруйноване місто",
    },
    fields: {
      genre: "Жанр",
      chapters: "Розділи",
      wordsPerChapter: "Слів/розд.",
      provider: "Провайдер",
      model: "Модель",
      judgeModel: "Модель-суддя",
      temperature: "Температура",
    },
    placeholders: {
      sourceTaleA: "напр. Мобі Дік",
      sourceTaleB: "напр. Той, що біжить по лезу",
      selectGenre: "Оберіть жанр…",
    },
    validation: {
      originalStoryA: "Оригінальна історія A",
      originalStoryB: "Оригінальна історія B",
      genre: "Жанр",
      pleaseFillIn: "Будь ласка, заповніть:",
    },
    sliders: {
      aggression: {
        label: "Агресія",
        description: "Інтенсивність нарративу та вербальна сила.",
      },
      readerRespect: {
        label: "Повага до читача",
        description: "Довіра до інтелекту читача.",
      },
      morality: {
        label: "Мораль",
        description: "Етична рамка та інтенсивність судження.",
      },
      sourceFidelity: {
        label: "Вірність джерелу",
        description: "Оригінальне джерело проти вигаданого нарративу.",
      },
    },
    tones: {
      aggressionAdjective: {
        strongly_minimized: "Спокійний",
        restrained: "Виважений",
        balanced: "Напружений",
        elevated: "Похмурий",
        dominant: "Вісцеральний",
      },
      moralityModifier: {
        strongly_minimized: "Нігілістичний",
        restrained: "Сірий",
        balanced: "",
        elevated: "Щирий",
        dominant: "Праведний",
      },
      genreFlavor: {
        noir: "Крутий",
        horror: "Страхітливий",
        thriller: "Напружений",
        fantasy: "Міфічний",
        scienceFiction: "Церебральний",
        romance: "Інтимний",
        historicalFiction: "Епохальний",
        fairyTale: "Зачарований",
        mystery: "Загадковий",
        adventure: "Кінетичний",
        mythology: "Епічний",
        speculativeFiction: "Спекулятивний",
      },
      channelLabel: {
        aggression: {
          strongly_minimized: "Лагідний",
          restrained: "Виважений",
          balanced: "Напружений",
          elevated: "Потужний",
          dominant: "Вибуховий",
        },
        readerRespect: {
          strongly_minimized: "Провокаційний",
          restrained: "Стислий",
          balanced: "Збалансований",
          elevated: "Довірливий",
          dominant: "Для експертів",
        },
        morality: {
          strongly_minimized: "Аморальний",
          restrained: "Неоднозначний",
          balanced: "Текстурований",
          elevated: "Принциповий",
          dominant: "Праведний",
        },
        sourceFidelity: {
          strongly_minimized: "Чиста вигадка",
          restrained: "Вільне натхнення",
          balanced: "Змішаний",
          elevated: "Вірний",
          dominant: "Канонічний",
        },
      },
    },
    bands: {
      strongly_minimized: "Мінімізований",
      restrained: "Стриманий",
      balanced: "Збалансований",
      elevated: "Підвищений",
      dominant: "Домінантний",
    },
    intensity: {
      strongly_minimized: "Мінімум",
      restrained: "Низька",
      balanced: "Помірна",
      elevated: "Висока",
      dominant: "Максимум",
    },
    status: {
      pending: "очікування",
      writing: "написання…",
      revising: "редагування",
      done: "готово",
      lowQuality: "низька якість",
      readyToGenerate: "Готово до генерації",
      pressForgeNarrative: "Натисніть «Кувати нарратив» для запуску агентного конвеєра.",
      streamReady: "Готово",
      streamConnecting: "З'єднання",
      streamOutlineReady: "Структуру готово",
      streamWritingChapter: "Пишемо розділ",
      streamRevisingChapter: "Редагуємо розділ",
      streamAttempt: "спроба",
      streamComplete: "Завершено",
      streamError: "Помилка",
    },
    buttons: {
      forgeNarrative: "КУВАТИ НАРРАТИВ",
      brewingNarrative: "ВАРИМО НАРРАТИВ",
      switch: "ЗМІНИТИ",
      dismiss: "ІГНОРУВАТИ",
      downloadPdf: "Завантажити PDF",
    },
    channels: {
      sectionLabel: "Калібрування каналів",
      description: "Діапазон 1–10. Гранульований контроль нарративу.",
    },
    provider: {
      sectionLabel: "Налаштування провайдера",
    },
    progress: {
      sectionLabel: "Прогрес довгої форми",
      tableOfContents: "Зміст",
      chaptersUnit: "розд.",
      wordsEachUnit: "слів кожен",
      error: "Помилка",
    },
    warnings: {
      stern_but_respectful:
        "Висока агресія з високою повагою до читача дає суворий професіоналізм, а не образливий тон.",
      preachy_risk: "Висока мораль з низькою повагою до читача може перетворитися на повчальну прозу.",
      detached_risk:
        "Низька мораль з високою повагою до читача може звучати клінічно відстороненою.",
      neutral_collapse_risk:
        "Збалансовані налаштування всіх повзунків можуть призвести до загальної прози без стилістичних якорів.",
      extreme_tone_risk:
        "Екстремальні налаштування допустимі, але слід оцінювати їх на зв'язність та безпечність.",
    },
    hints: {
      setGenreToBegin: "Встановіть жанр і відкалібруйте канали для початку",
    },
    pdf: {
      exportFailed: "Помилка експорту PDF — спробуйте ще раз",
    },
  },
  ui: {
    header: {
      title: "Змішувач Історій",
      subtitle: "LoreForge — Відкалібрований Нарратив",
      studioReady: "Студія готова",
    },
    footer: {
      tagline:
        "LoreForge · Генерація відкаліброваного нарративу · налаштуй вайб, зваряй історію",
    },
    agentLog: {
      title: "Журнал взаємодії агентів",
      empty: "Ще немає взаємодій — почніть генерацію, щоб побачити конвеєр агентів.",
    },
    notFound: {
      title: "Сторінку не знайдено",
      body: "Сторінка, яку ви запитали, не існує або могла бути переміщена.",
      returnHome: "На головну",
    },
  },
};

export default uk;
