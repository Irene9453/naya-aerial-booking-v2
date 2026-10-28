export type AerialMilestone = {
  classes: number;
  name: string;
  englishName: string;
  emoji: string;
  reward: "digital_card" | "gift";
  certificate: boolean;
};

export const AERIAL_MILESTONES: AerialMilestone[] = [
  {
    classes: 5,
    name: "初次展翅",
    englishName: "First Wings",
    emoji: "🪽",
    reward: "digital_card",
    certificate: false,
  },
  {
    classes: 10,
    name: "輕盈起飛",
    englishName: "Take Flight",
    emoji: "✨",
    reward: "digital_card",
    certificate: false,
  },
  {
    classes: 25,
    name: "雲端漫遊",
    englishName: "Cloud Walker",
    emoji: "☁️",
    reward: "digital_card",
    certificate: false,
  },
  {
    classes: 50,
    name: "蛻變之翼",
    englishName: "Wings of Growth",
    emoji: "🦋",
    reward: "digital_card",
    certificate: false,
  },
  {
    classes: 75,
    name: "逐月飛行",
    englishName: "Moon Chaser",
    emoji: "🌙",
    reward: "digital_card",
    certificate: false,
  },
  {
    classes: 100,
    name: "百堂星光",
    englishName: "Century Star",
    emoji: "💎",
    reward: "gift",
    certificate: true,
  },
  {
    classes: 200,
    name: "星際旅人",
    englishName: "Star Voyager",
    emoji: "🌠",
    reward: "digital_card",
    certificate: false,
  },
  {
    classes: 300,
    name: "銀河漫遊",
    englishName: "Galaxy Dancer",
    emoji: "🪐",
    reward: "gift",
    certificate: true,
  },
  {
    classes: 400,
    name: "天空傳奇",
    englishName: "Sky Legend",
    emoji: "👑",
    reward: "digital_card",
    certificate: false,
  },
  {
    classes: 500,
    name: "無垠之翼",
    englishName: "Infinite Wings",
    emoji: "🌌",
    reward: "gift",
    certificate: true,
  },
];

// 取得已解鎖的里程碑
export function getUnlockedMilestones(
  completedClasses: number
): AerialMilestone[] {
  return AERIAL_MILESTONES.filter(
    (milestone) => completedClasses >= milestone.classes
  );
}

// 取得下一個里程碑
export function getNextMilestone(
  completedClasses: number
): AerialMilestone | null {
  return (
    AERIAL_MILESTONES.find(
      (milestone) => completedClasses < milestone.classes
    ) ?? null
  );
}

// 計算距離下一個里程碑還差幾堂
export function getClassesUntilNextMilestone(
  completedClasses: number
): number {
  const next = getNextMilestone(completedClasses);

  return next
    ? Math.max(0, next.classes - completedClasses)
    : 0;
}

// 取得目前所在里程碑
export function getCurrentMilestone(
  completedClasses: number
): AerialMilestone | null {
  const unlocked = getUnlockedMilestones(completedClasses);

  return unlocked[unlocked.length - 1] ?? null;
}

// 計算目前階段的進度（0～100）
export function getJourneyProgress(
  completedClasses: number
): number {
  const next = getNextMilestone(completedClasses);

  if (!next) {
    return 100;
  }

  const current = getCurrentMilestone(completedClasses);
  const startingClasses = current?.classes ?? 0;

  return Math.min(
    100,
    Math.max(
      0,
      ((completedClasses - startingClasses) /
        (next.classes - startingClasses)) *
        100
    )
  );
}