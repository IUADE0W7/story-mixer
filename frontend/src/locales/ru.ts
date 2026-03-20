import type en from "./en";

const ru: typeof en = {
  vibe: {
    briefing: {
      sectionLabel: "Инструкции к истории",
      description: "Определите источники для смешивания и задайте начальную сцену.",
      sourceTaleA: "Источник A",
      sourceTaleB: "Источник B",
      narrativeTone: "Тон нарратива",
      narrativeFallback: "Нарратив",
    },
    language: {
      sectionLabel: "Язык истории",
      english: "Английский",
      ukrainian: "Украинский",
      russian: "Русский",
      kazakh: "Казахский",
      cyrillicDetected: "🇷🇺 Обнаружен кириллический текст — сменить язык?",
    },
    brief: {
      sectionLabel: "Краткое описание",
      placeholder: "Опишите начальную сцену, главного героя, место действия и тип напряжения.",
    },
    seeds: {
      loneWanderer: "Одинокий странник",
      darkProphecy: "Тёмное пророчество",
      hiddenMonster: "Скрытый монстр",
      unlikelyAllies: "Неожиданные союзники",
      forbiddenArchive: "Запретный архив",
      lastBloodline: "Последняя линия крови",
      theBetrayal: "Предательство",
      shatteredCity: "Разрушенный город",
      loneWandererSeed: "Одинокий странник появляется на краю умирающего мира — без имени и без чего-либо, что стоило бы удерживать.",
      darkProphecySeed: "Пророчество требует жертвы, на которую ни один герой не готов — и обратный отсчёт уже начался.",
      hiddenMonsterSeed: "Чудовище, которого они боялись, никогда не было зверем. Это был союзник, улыбавшийся на пороге.",
      unlikelyAlliesSeed: "Двое заклятых врагов, связанных необходимостью, должны доверять друг другу то, что ни один не может позволить себе потерять.",
      forbiddenArchiveSeed: "Запечатанный архив хранит единственную истину, способную разрушить империю — и кто-то уже знает её.",
      lastBloodlineSeed: "Последний наследник древнего рода несёт силу, которой не может управлять, и цену, которую не может заплатить.",
      theBetraySeed: "Доверенная фигура предаёт их в последний момент. У неё были веские причины. От этого только хуже.",
      shatteredCitySeed: "Некогда великий город лежит в руинах. Кто-то отстраивает его — не чтобы восстановить утраченное, а чтобы стереть его.",
    },
    fields: {
      genre: "Жанр",
      chapters: "Главы",
      wordsPerChapter: "Слов/гл.",
      provider: "Провайдер",
      model: "Модель",
      temperature: "Температура",
    },
    genres: {
      fantasy: "Фэнтези",
      scienceFiction: "Научная фантастика",
      horror: "Ужасы",
      noir: "Нуар",
      romance: "Романс",
      thriller: "Триллер",
      historicalFiction: "Историческая проза",
      fairyTale: "Сказка",
      mystery: "Детектив",
      adventure: "Приключения",
      mythology: "Мифология",
      speculativeFiction: "Спекулятивная фантастика",
    },
    placeholders: {
      sourceTaleA: "напр. Моби Дик",
      sourceTaleB: "напр. Бегущий по лезвию",
      selectGenre: "Выберите жанр…",
    },
    validation: {
      originalStoryA: "Оригинальная история A",
      originalStoryB: "Оригинальная история B",
      genre: "Жанр",
      pleaseFillIn: "Пожалуйста, заполните:",
    },
    sliders: {
      aggression: {
        label: "Агрессия",
        description: "Интенсивность нарратива и вербальная сила.",
      },
      readerRespect: {
        label: "Уважение к читателю",
        description: "Доверие к интеллекту читателя.",
      },
      morality: {
        label: "Мораль",
        description: "Этическая рамка и интенсивность суждения.",
      },
      sourceFidelity: {
        label: "Верность источнику",
        description: "Оригинальный источник против придуманного нарратива.",
      },
    },
    tones: {
      aggressionAdjective: {
        strongly_minimized: "Спокойный",
        restrained: "Взвешенный",
        balanced: "Напряжённый",
        elevated: "Мрачный",
        dominant: "Висцеральный",
      },
      moralityModifier: {
        strongly_minimized: "Нигилистический",
        restrained: "Серый",
        balanced: "",
        elevated: "Искренний",
        dominant: "Праведный",
      },
      genreFlavor: {
        noir: "Крутой",
        horror: "Жуткий",
        thriller: "Напряжённый",
        fantasy: "Мифический",
        scienceFiction: "Церебральный",
        romance: "Интимный",
        historicalFiction: "Эпохальный",
        fairyTale: "Сказочный",
        mystery: "Загадочный",
        adventure: "Кинетический",
        mythology: "Эпический",
        speculativeFiction: "Спекулятивный",
      },
      channelLabel: {
        aggression: {
          strongly_minimized: "Мягкий",
          restrained: "Взвешенный",
          balanced: "Напряжённый",
          elevated: "Мощный",
          dominant: "Взрывной",
        },
        readerRespect: {
          strongly_minimized: "Провокационный",
          restrained: "Лаконичный",
          balanced: "Сбалансированный",
          elevated: "Доверяющий",
          dominant: "Для экспертов",
        },
        morality: {
          strongly_minimized: "Аморальный",
          restrained: "Неоднозначный",
          balanced: "Текстурированный",
          elevated: "Принципиальный",
          dominant: "Праведный",
        },
        sourceFidelity: {
          strongly_minimized: "Чистый вымысел",
          restrained: "Свободное вдохновение",
          balanced: "Смешанный",
          elevated: "Верный",
          dominant: "Канонический",
        },
      },
    },
    bands: {
      strongly_minimized: "Минимизированный",
      restrained: "Сдержанный",
      balanced: "Сбалансированный",
      elevated: "Повышенный",
      dominant: "Доминантный",
    },
    intensity: {
      strongly_minimized: "Минимум",
      restrained: "Низкая",
      balanced: "Умеренная",
      elevated: "Высокая",
      dominant: "Максимум",
    },
    status: {
      pending: "ожидание",
      writing: "написание…",
      revising: "редактирование",
      done: "готово",
      lowQuality: "низкое качество",
      readyToGenerate: "Готово к генерации",
      pressForgeNarrative: "Нажмите «Ковать нарратив» для запуска агентного конвейера.",
      streamReady: "Готово",
      streamConnecting: "Подключение",
      streamOutlineReady: "Структура готова",
      streamWritingChapter: "Пишем главу",
      streamRevisingChapter: "Редактируем главу",
      streamAttempt: "попытка",
      streamComplete: "Завершено",
      streamError: "Ошибка",
      streamRateLimited: "Лимит запросов исчерпан",
      streamUnauthenticated: "Не аутентифицирован",
      rateLimitRetryPrefix: "Лимит достигнут. Попробуйте снова в",
    },
    buttons: {
      forgeNarrative: "КОВАТЬ НАРРАТИВ",
      brewingNarrative: "ВАРИМ НАРРАТИВ",
      switch: "СМЕНИТЬ",
      dismiss: "ОТКЛОНИТЬ",
      downloadPdf: "Скачать PDF",
    },
    channels: {
      sectionLabel: "Калибровка каналов",
      description: "Диапазон 1–10. Гранулированный контроль нарратива.",
    },
    provider: {
      sectionLabel: "Настройки провайдера",
    },
    progress: {
      sectionLabel: "Прогресс длинной формы",
      tableOfContents: "Содержание",
      chaptersUnit: "гл.",
      wordsEachUnit: "слов каждая",
      error: "Ошибка",
    },
    warnings: {
      stern_but_respectful:
        "Высокая агрессия с высоким уважением к читателю даёт строгий профессионализм, а не оскорбительный тон.",
      preachy_risk: "Высокая мораль с низким уважением к читателю может превратиться в поучительную прозу.",
      detached_risk:
        "Низкая мораль с высоким уважением к читателю может звучать клинически отстранённо.",
      neutral_collapse_risk:
        "Сбалансированные настройки всех ползунков могут привести к обобщённой прозе без стилистических якорей.",
      extreme_tone_risk:
        "Экстремальные настройки допустимы, но следует оценивать их на связность и безопасность.",
    },
    hints: {
      setGenreToBegin: "Установите жанр и откалибруйте каналы для начала",
    },
    pdf: {
      exportFailed: "Ошибка экспорта PDF — попробуйте ещё раз",
    },
  },
  ui: {
    header: {
      title: "Миксер историй",
      subtitle: "LoreForge — Откалиброванный нарратив",
      studioReady: "Студия готова",
    },
    footer: {
      tagline:
        "LoreForge · Генерация откалиброванного нарратива · настрой вайб, свари историю",
    },
    agentLog: {
      title: "Журнал взаимодействия агентов",
      empty: "Взаимодействий пока нет — начните генерацию, чтобы увидеть конвейер агентов.",
    },
    notFound: {
      title: "Страница не найдена",
      body: "Запрошенная страница не существует или была перемещена.",
      returnHome: "На главную",
    },
  },
};

export default ru;
