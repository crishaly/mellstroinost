function applyXp(user, pet, actionType) {
  const REWARDS = {
  feed: { xp: 6, coins: 1 },
  pet: { xp: 5, coins: 1 },
  clean: { xp: 8, coins: 2 },
  sleep: { xp: 3, coins: 0 },
  wake: { xp: 2, coins: 0 },
};

  user.level = user.level ?? 1;
  user.xp = user.xp ?? 0;
  user.coins = user.coins ?? 0;

  user.xp += XP_PER_ACTION;

  let threshold = user.level * 50;

  while (user.xp >= threshold) {
    user.xp -= threshold;
    user.level += 1;
    user.coins += 10;

    pet.hunger = Math.min(100, pet.hunger + 10);
    pet.mood = Math.min(100, pet.mood + 10);
    pet.energy = Math.min(100, pet.energy + 10);
    pet.cleanliness = Math.min(100, pet.cleanliness + 10);

    threshold = user.level * 50;
  }
}

module.exports = { applyXp };