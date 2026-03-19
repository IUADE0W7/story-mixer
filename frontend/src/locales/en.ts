const en = {
  vibe: {
    briefing: {
      sectionLabel: "Story Briefing",
      description: "Define the source tales to blend and craft the opening scene.",
      sourceTaleA: "Source Tale A",
      sourceTaleB: "Source Tale B",
      narrativeTone: "Narrative Tone",
      narrativeFallback: "Narrative",
    },
    language: {
      sectionLabel: "Story Language",
      english: "English",
      ukrainian: "Ukrainian",
      cyrillicDetected: "🇺🇦 Ukrainian text detected — switch story language?",
    },
    brief: {
      sectionLabel: "Story Brief",
      placeholder: "Describe the opening scene, protagonist, setting, and the kind of tension you want.",
    },
    seeds: {
      loneWanderer: "Lone Wanderer",
      darkProphecy: "Dark Prophecy",
      hiddenMonster: "Hidden Monster",
      unlikelyAllies: "Unlikely Allies",
      forbiddenArchive: "Forbidden Archive",
      lastBloodline: "Last Bloodline",
      theBetrayal: "The Betrayal",
      shatteredCity: "Shattered City",
    },
    fields: {
      genre: "Genre",
      chapters: "Chapters",
      wordsPerChapter: "Words/ch.",
      provider: "Provider",
      model: "Model",
      judgeModel: "Judge Model",
      temperature: "Temperature",
    },
    placeholders: {
      sourceTaleA: "e.g. Moby Dick",
      sourceTaleB: "e.g. Blade Runner",
      selectGenre: "Select genre…",
    },
    validation: {
      originalStoryA: "Original Story A",
      originalStoryB: "Original Story B",
      genre: "Genre",
      pleaseFillIn: "Please fill in:",
    },
    sliders: {
      aggression: {
        label: "Aggression",
        description: "Narrative intensity and verbal force.",
      },
      readerRespect: {
        label: "Reader Respect",
        description: "Trust in the reader's intelligence.",
      },
      morality: {
        label: "Morality",
        description: "Ethical framing and judgment intensity.",
      },
      sourceFidelity: {
        label: "Source Fidelity",
        description: "Original source vs. invented narrative.",
      },
    },
    tones: {
      aggressionAdjective: {
        strongly_minimized: "Tranquil",
        restrained: "Measured",
        balanced: "Charged",
        elevated: "Grim",
        dominant: "Visceral",
      },
      moralityModifier: {
        strongly_minimized: "Nihilistic",
        restrained: "Gray",
        balanced: "",
        elevated: "Earnest",
        dominant: "Righteous",
      },
      genreFlavor: {
        noir: "Hardboiled",
        horror: "Dread-Laden",
        thriller: "High-Stakes",
        fantasy: "Mythic",
        scienceFiction: "Cerebral",
        romance: "Intimate",
        historicalFiction: "Period",
        fairyTale: "Enchanted",
        mystery: "Cryptic",
        adventure: "Kinetic",
        mythology: "Epic",
        speculativeFiction: "Speculative",
      },
      channelLabel: {
        aggression: {
          strongly_minimized: "Gentle",
          restrained: "Measured",
          balanced: "Tense",
          elevated: "Forceful",
          dominant: "Combustive",
        },
        readerRespect: {
          strongly_minimized: "Provocative",
          restrained: "Spare",
          balanced: "Balanced",
          elevated: "Trusting",
          dominant: "Expert-facing",
        },
        morality: {
          strongly_minimized: "Amoral",
          restrained: "Ambiguous",
          balanced: "Textured",
          elevated: "Principled",
          dominant: "Righteous",
        },
        sourceFidelity: {
          strongly_minimized: "Pure Invention",
          restrained: "Loose Inspiration",
          balanced: "Blended",
          elevated: "Faithful",
          dominant: "Canonical",
        },
      },
    },
    bands: {
      strongly_minimized: "Strongly Minimized",
      restrained: "Restrained",
      balanced: "Balanced",
      elevated: "Elevated",
      dominant: "Dominant",
    },
    intensity: {
      strongly_minimized: "Minimal",
      restrained: "Low",
      balanced: "Moderate",
      elevated: "High",
      dominant: "Max",
    },
    status: {
      pending: "pending",
      writing: "writing…",
      revising: "revising",
      done: "done",
      lowQuality: "low quality",
      readyToGenerate: "Ready to generate",
      pressForgeNarrative: "Press Forge Narrative to start the agentic pipeline.",
      streamReady: "Ready",
      streamConnecting: "Connecting",
      streamOutlineReady: "Outline ready",
      streamWritingChapter: "Writing chapter",
      streamRevisingChapter: "Revising chapter",
      streamAttempt: "attempt",
      streamComplete: "Complete",
      streamError: "Error",
      streamRateLimited: "Rate limit reached",
      streamUnauthenticated: "Not authenticated",
      rateLimitRetryPrefix: "Limit reached. Try again at",
    },
    buttons: {
      forgeNarrative: "FORGE NARRATIVE",
      brewingNarrative: "BREWING NARRATIVE",
      switch: "SWITCH",
      dismiss: "DISMISS",
      downloadPdf: "Download PDF",
    },
    channels: {
      sectionLabel: "Channel Calibration",
      description: "1 – 10 range. Granular narrative control.",
    },
    provider: {
      sectionLabel: "Provider Configuration",
    },
    progress: {
      sectionLabel: "Long-form Progress",
      tableOfContents: "Table of Contents",
      chaptersUnit: "chapters",
      wordsEachUnit: "words each",
      error: "Error",
    },
    warnings: {
      stern_but_respectful:
        "High aggression plus high reader respect targets stern professionalism, not abusive tone.",
      preachy_risk: "High morality with low reader respect can drift into lecturing prose.",
      detached_risk: "Low morality with high reader respect can read clinically detached.",
      neutral_collapse_risk:
        "Balanced settings across all sliders may produce generic prose without stylistic anchors.",
      extreme_tone_risk:
        "Extreme settings are valid but should be judged for coherence and policy safety.",
    },
    hints: {
      setGenreToBegin: "Set genre and calibrate channels to begin",
    },
    pdf: {
      exportFailed: "PDF export failed — try again",
    },
  },
  ui: {
    header: {
      title: "Story Mixer",
      subtitle: "LoreForge — Calibrated Narrative",
      studioReady: "Studio ready",
    },
    footer: {
      tagline: "LoreForge · Calibrated narrative generation · tune the vibe, brew the story",
    },
    agentLog: {
      title: "Agent Interaction Log",
      empty: "No interactions recorded yet — start generation to see the agent pipeline.",
    },
    notFound: {
      title: "Page not found",
      body: "The page you requested does not exist or may have been moved.",
      returnHome: "Return Home",
    },
  },
};

export default en;
