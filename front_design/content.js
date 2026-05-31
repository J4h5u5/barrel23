/* ============================================================
   BARREL 23 — content model
   This is the single source of truth for all editable content.
   Your backend / DB fills this same shape. On the front-end we
   read defaults here, then merge any override saved by the admin
   panel into localStorage ("barrel23_content").
   ============================================================ */

window.BARREL_DEFAULT_CONTENT = {
  brand: {
    name: "BARREL 23",
    logo: "assets/logo.png",
    wordmark: "assets/wordmark.png"
  },

  /* Hidden for now — flip enabled:true to show the top nav */
  nav: {
    enabled: false,
    items: ["ARCHIVE", "MERCH", "LINEUP", "TICKETS", "INFO"]
  },

  hero: {
    eventName: "COVEN",
    edition: "VOL. 03",
    tagline: "HARD TECHNO · SCHRANZ · UNDERGROUND",
    location: "DUBAI — UAE",
    targetDate: "2026-06-20T22:00:00",
    video: "assets/bg.mp4"
  },

  announce: {
    kicker: "NEXT TRANSMISSION",
    eventName: "COVEN",
    date: "20 JUNE 2026",
    doors: "22:00 — TILL SUNRISE",
    city: "DUBAI",
    venue: "SECRET LOCATION — DROPPED ON RSVP",
    blurb: "One room. One system. No daylight. COVEN returns to a stripped-out underground floor in Dubai for a night built around weight, speed and the people who came to lose their heads. Hard techno, schranz and everything that hits at 150+.",
    lineupLabel: "LINE-UP",
    lineup: [
      { name: "Orangen_Hai", tag: "HEADLINE" },
      { name: "T0tal", tag: "B2B" },
      { name: "Kamavosian", tag: "B2B" },
      { name: "Heath", tag: "" },
      { name: "Deeb", tag: "" }
    ],
    ticketLabel: "GET TICKETS",
    ticketUrl: "#tickets",
    images: ["assets/gal_7.jpg", "assets/gal_10.jpg", "assets/gal_3.jpg", "assets/gal_9.jpg"]
  },

  pastEvents: [
    {
      name: "COVEN",
      date: "23.05.2026",
      city: "DUBAI",
      image: "assets/gal_8.jpg",
      lineup: ["Orangen_Hai", "Heath", "T0tal", "Kamavosian"]
    },
    {
      name: "COVEN",
      date: "02.02.2026",
      city: "DUBAI",
      image: "assets/gal_9.jpg",
      lineup: ["Kamavosian", "Deeb", "T0tal"]
    }
  ],

  djs: [
    { name: "Orangen_Hai", role: "RESIDENT", image: "assets/gal_0.jpg",
      socials: { instagram: "#", soundcloud: "#" } },
    { name: "Heath", role: "RESIDENT", image: "assets/gal_1.jpg",
      socials: { instagram: "#", soundcloud: "#" } },
    { name: "T0tal", role: "RESIDENT", image: "assets/gal_4.jpg",
      socials: { instagram: "#", soundcloud: "#" } },
    { name: "Kamavosian", role: "RESIDENT", image: "assets/gal_5.jpg",
      socials: { instagram: "#", soundcloud: "#" } },
    { name: "Deeb", role: "RESIDENT", image: "assets/gal_6.jpg",
      socials: { instagram: "#", soundcloud: "#" } }
  ],

  /* Audio is mocked — durations in seconds, playback is simulated */
  sets: [
    { title: "CLOSING RITUAL", dj: "T0tal",       event: "COVEN — 23.05.2026", duration: 3840 },
    { title: "PEAK FLOOR",     dj: "Kamavosian",  event: "COVEN — 23.05.2026", duration: 3360 },
    { title: "OPENING SALVO",  dj: "Heath",       event: "COVEN — 02.02.2026", duration: 3000 },
    { title: "AFTER HOURS",    dj: "Deeb",        event: "COVEN — 02.02.2026", duration: 4200 },
    { title: "WAREHOUSE TOOLS","dj": "Orangen_Hai", event: "COVEN — 23.05.2026", duration: 2760 }
  ],

  about: {
    kicker: "WHO WE ARE",
    statement: "WE ARE UNDERGROUND. WE BROUGHT THE RAVE TO THE EMIRATES.",
    paragraphs: [
      "BARREL 23 started because we got tired of looking for the music we love and never finding it. So we stopped searching and started building it ourselves — and bringing it to the UAE.",
      "We hunt for rooms where you can switch your head off and let go. No posing, no daylight, no compromise — just weight, speed and a crowd that came for the same thing you did.",
      "We're here to grow a real rave and put local heads face to face with the culture: hard techno, schranz and everything around it."
    ],
    styles: ["HARD TECHNO", "SCHRANZ", "HARDGROOVE", "INDUSTRIAL", "ACID", "RAW TECHNO"],
    equipment: {
      heading: "THE SOUND",
      body: "We run Function-One. We're obsessive about it. The system is half the reason you came, and we treat your night — your ears, your body, your experience — with everything we've got."
    }
  },

  contacts: {
    email: "info@barrel23.rave",
    bookings: "bookings@barrel23.rave"
  },

  socials: {
    instagram: "#",
    soundcloud: "#",
    telegram: "#",
    tiktok: "#",
    youtube: "#"
  }
};

/* Merge helper used by both site + admin */
window.BARREL_loadContent = function () {
  var base = JSON.parse(JSON.stringify(window.BARREL_DEFAULT_CONTENT));
  try {
    var saved = localStorage.getItem("barrel23_content");
    if (saved) {
      var o = JSON.parse(saved);
      return Object.assign(base, o);
    }
  } catch (e) {}
  return base;
};
window.BARREL_saveContent = function (obj) {
  localStorage.setItem("barrel23_content", JSON.stringify(obj));
};
