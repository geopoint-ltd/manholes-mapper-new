// Centralized constants and option catalogs for Graph Sketcher
// NOTE: main.js still defines these inline; we will switch imports to this module incrementally.

export const NODE_RADIUS = 20;

// Detect if user prefers dark mode
export function isDarkMode() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Light mode colors
const COLORS_LIGHT = {
  node: {
    fillDefault: '#60a5fa',   // blue-400 (more blue)
    fillMissing: '#fb923c',   // orange-400 (more orange)
    fillSelectedMissing: '#fed7aa', // orange-200 (richer than 100)
    fillBlocked: '#cbd5e1',   // slate-300
    fillSelected: '#bfdbfe',  // blue-200 (richer than 100)
    fillDrainageComplete: '#0ea5e9', // sky-500 (drainage node when complete)
    stroke: '#2563eb',        // blue-600
    label: '#1f2937',         // slate-800 (dark text for light mode)
    houseRoof: '#795548',     // brown-600 (house roof)
    houseBody: '#d7ccc8',     // brown-100 (house body)
    houseDoor: '#6d4c41',     // brown-700 (house door)
    badgeBg: '#16a34a',       // green-600 (connection badge)
    badgeIcon: '#ffffff',     // white (badge icon)
  },
  edge: {
    typePrimary: '#2563eb',   // blue-600
    typeSecondary: '#0d9488', // teal-600
    typeDrainage: '#fb923c',  // orange-400 (drainage line)
    selected: '#7c3aed',      // violet-600
    selectedPrimary: '#60a5fa', // blue-400 (selected primary)
    selectedDrainage: '#fdba74', // orange-300 (selected drainage)
    selectedSecondary: '#86efac', // green-300 (selected secondary)
    preview: '#94a3b8',       // slate-400
    label: '#334155',         // slate-700 (dark text for light mode)
    labelStroke: '#ffffff',   // white stroke for light mode
    fallIconBg: '#bfdbfe',    // blue-200 (fall icon background)
    fallIconStroke: '#ffffff', // white (fall icon stroke)
    fallIconFallback: '#0ea5e9', // sky-500 (fallback icon fill)
    fallIconText: '#ffffff',  // white (fallback icon text)
  },
  grid: {
    stroke: 'rgba(0, 0, 0, 0.06)', // semi-transparent black for light mode
  }
};

// Dark mode colors
const COLORS_DARK = {
  node: {
    fillDefault: '#60a5fa',   // blue-400
    fillMissing: '#fb923c',   // orange-400
    fillSelectedMissing: '#fed7aa', // orange-200
    fillBlocked: '#475569',   // slate-600 (darker for dark mode)
    fillSelected: '#3b82f6',  // blue-500 (more vibrant for dark mode)
    fillDrainageComplete: '#38bdf8', // sky-400 (brighter drainage node for dark mode)
    stroke: '#60a5fa',        // blue-400 (lighter stroke for dark mode)
    label: '#f1f5f9',         // slate-100 (light text for dark mode)
    houseRoof: '#a1887f',     // brown-400 (lighter house roof for dark mode)
    houseBody: '#6d4c41',     // brown-700 (darker house body for dark mode)
    houseDoor: '#3e2723',     // brown-900 (darkest house door for dark mode)
    badgeBg: '#22c55e',       // green-500 (brighter badge for dark mode)
    badgeIcon: '#f0fdf4',     // green-50 (light badge icon for dark mode)
  },
  edge: {
    typePrimary: '#60a5fa',   // blue-400 (lighter for dark mode)
    typeSecondary: '#14b8a6', // teal-500 (lighter for dark mode)
    typeDrainage: '#fb923c',  // orange-400 (drainage line - same for both modes)
    selected: '#a78bfa',      // violet-400 (lighter for dark mode)
    selectedPrimary: '#93c5fd', // blue-300 (selected primary for dark mode)
    selectedDrainage: '#fdba74', // orange-300 (selected drainage - same for both modes)
    selectedSecondary: '#6ee7b7', // green-300 (selected secondary for dark mode)
    preview: '#94a3b8',       // slate-400
    label: '#f1f5f9',         // slate-100 (light text for dark mode)
    labelStroke: '#1e293b',   // slate-800 (dark stroke for dark mode)
    fallIconBg: '#1e40af',    // blue-800 (fall icon background for dark mode)
    fallIconStroke: '#60a5fa', // blue-400 (fall icon stroke for dark mode)
    fallIconFallback: '#3b82f6', // blue-500 (fallback icon fill for dark mode)
    fallIconText: '#e0f2fe',  // sky-100 (fallback icon text for dark mode)
  },
  grid: {
    stroke: 'rgba(255, 255, 255, 0.1)', // semi-transparent white for dark mode
  }
};

// Export COLORS object that dynamically returns colors based on current theme
export const COLORS = new Proxy({}, {
  get(target, prop) {
    const colors = isDarkMode() ? COLORS_DARK : COLORS_LIGHT;
    return colors[prop];
  }
});

export const NODE_TYPES = ['type1', 'type2'];

/** Semantic node categories shown in the details drawer type dropdown. */
export const NODE_TYPE_OPTIONS = [
  { value: 'Manhole', i18nKey: 'modeNode' },
  { value: 'Home', i18nKey: 'modeHome' },
];

export const NODE_MATERIAL_OPTIONS = [
  { code: 0, label: 'לא ידוע' },
  { code: 1, label: 'פלדה מגולוונת' },
  { code: 2, label: 'פלדה עם ציפוי פנים וחוץ' },
  { code: 3, label: 'פלדה ללא ציפוי' },
  { code: 4, label: 'פי. וי. סי. לפי ת"י 884' },
  { code: 5, label: 'פי. וי. סי. לחץ' },
  { code: 6, label: 'פיברגלס' },
  { code: 7, label: 'בטון' },
  { code: 8, label: 'אסבסט צמנט' },
  { code: 10, label: 'פקסגול - פוליאטילן' },
  { code: 11, label: 'יציקת ברזל' },
  { code: 12, label: 'פלסטיק - שוחת חופית' },
  { code: 13, label: 'שוחת PVC' },
  { code: 9, label: 'אבו' },
];

export const NODE_COVER_DIAMETERS = ['לא ידוע', '35', '45', '55', '65'];

export const NODE_ACCESS_OPTIONS = [
  { code: 0, label: 'לא ידוע' },
  { code: 1, label: 'מדרגות ברזל חשוף' },
  { code: 2, label: 'מדרגות ברזל מצופה PVC' },
  { code: 3, label: 'סולם פלדה' },
  { code: 4, label: 'אין אמצעי ירידה' },
  { code: 5, label: 'מדרגות PVC מובנות' },
];

export const NODE_ENGINEERING_STATUS = [
  { code: 0, label: 'לא ידוע' },
  { code: 1, label: 'פעיל' },
  { code: 2, label: 'לא פעיל' },
  { code: 3, label: 'מתוכנן' },
  { code: 4, label: 'מבוטל' },
];

export const NODE_MAINTENANCE_OPTIONS = [
  { code: 0, label: 'לא ידוע' },
  { code: 1, label: 'תקין' },
  { code: 2, label: 'אביזר שבור' },
  { code: 3, label: 'לא ניתן לפתיחה' },
  { code: 4, label: 'שוחה מכוסה' },
  { code: 5, label: 'שוחת ביוב - ללא גישה' },
  { code: 6, label: 'שוחה מלאה חול / זבל' },
  { code: 7, label: 'מספל גבוה (סתומה)' },
  { code: 8, label: 'מכסה שבור/לא תקין' },
  { code: 9, label: 'שוחה יבשה/קו יבש' },
  { code: 10, label: 'ללא מכסה' },
  { code: 11, label: 'לא מחובר' },
  { code: 12, label: 'הכנה' },
  { code: 13, label: 'בית נעול' },
  { code: 14, label: 'אחר' },
];

// Accuracy level for nodes (0 = Engineering, 1 = Schematic)
export const NODE_ACCURACY_OPTIONS = [
  { code: 0, label: 'הנדסית' },
  { code: 1, label: 'סכימטית' },
];

export const EDGE_MATERIAL_OPTIONS = [
  { code: 0, label: 'לא ידוע' },
  { code: 1, label: 'פלדה מגולוונת' },
  { code: 2, label: 'פלדה עם ציפוי פנים וחוץ' },
  { code: 3, label: 'פלדה ללא ציפוי' },
  { code: 4, label: 'פי. וי. סי. לפי ת"י 884' },
  { code: 5, label: 'פי. וי. סי. לחץ' },
  { code: 6, label: 'פיברגלס' },
  { code: 7, label: 'בטון' },
  { code: 8, label: 'אסבסט צמנט' },
  { code: 10, label: 'פקסגול - פוליאטילן' },
  { code: 11, label: 'יציקת ברזל' },
  { code: 12, label: 'פלסטיק - שוחת חופית' },
  { code: 13, label: 'שוחת PVC' },
  { code: 9, label: 'אבו' },
];

export const EDGE_LINE_DIAMETERS = [
  '10','25','26','50','75','100','150','160','200','250','300','350','400','500','600','650','700','800','900','1000','1250','1500','1800','2000'
];

export const EDGE_TYPES = ['קו ראשי', 'קו סניקה', 'קו משני'];

export const EDGE_TYPE_COLORS = {
  'קו ראשי': COLORS.edge.typePrimary,
  'קו סניקה': COLORS.edge.typeDrainage,
  'קו משני': COLORS.edge.typeSecondary,
};

// Colors used when an edge is selected: slightly lighter variant per edge type
export const EDGE_TYPE_SELECTED_COLORS = {
  'קו ראשי': COLORS.edge.selectedPrimary,
  'קו סניקה': COLORS.edge.selectedDrainage,
  'קו משני': COLORS.edge.selectedSecondary,
};

export const EDGE_TYPE_OPTIONS = [
  { code: 4801, label: 'קו ראשי' },
  { code: 4802, label: 'קו סניקה' },
  { code: 4803, label: 'קו משני' },
];

export const EDGE_ENGINEERING_STATUS = [
  { code: 0, label: 'לא ידוע' },
  { code: 1, label: 'פעיל' },
  { code: 2, label: 'לא פעיל' },
  { code: 3, label: 'מתוכנן' },
  { code: 4, label: 'מבוטל' },
];
