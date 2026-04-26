export function buildQuarterLabel(year, quarter) {
  return `${quarter} ${year}`;
}

export function currentQuarter() {
  const month = new Date().getMonth();
  if (month < 3) return 'Q1';
  if (month < 6) return 'Q2';
  if (month < 9) return 'Q3';
  return 'Q4';
}

export function normalizeScoreInput(value) {
  if (value === '' || value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num;
}

export function qbMultiplierFromCompletedTasks(count) {
  if (count >= 5) return 0.5;
  if (count >= 3) return 0.3;
  if (count >= 1) return 0.2;
  return 0;
}

export function computeManualSummary(profile, rawScores = {}, completedJiraTaskCount = 0) {
  if (!profile) {
    return {
      finalScore: null,
      activeDomainCount: 0,
      hasViolation: false,
      eligibleBonus: false,
      completedJiraTaskCount: 0,
      qbMultiplier: 0,
      scores: {},
    };
  }

  let total = 0;
  let count = 0;
  let hasViolation = false;
  const scores = {};

  for (const domain of profile.domains || []) {
    const value = normalizeScoreInput(rawScores[domain.key]);
    scores[domain.key] = value;
    if (value === null) continue;
    if (value === -1) {
      hasViolation = true;
      continue;
    }
    total += value;
    count += 1;
  }

  const qbMultiplier = qbMultiplierFromCompletedTasks(completedJiraTaskCount);
  const finalScore = hasViolation
    ? -1
    : count
      ? Number((total / count).toFixed(2))
      : profile?.key === 'project_manager'
        ? 3
        : null;
  return {
    finalScore,
    activeDomainCount: count,
    hasViolation,
    eligibleBonus: finalScore !== null && finalScore !== -1 && finalScore >= 3 && qbMultiplier > 0,
    completedJiraTaskCount,
    qbMultiplier,
    scores,
  };
}
