function nowIso() {
  return new Date().toISOString();
}

function applyTimeDecay(pet) {
  const now = Date.now();
  const prev = new Date(pet.updated_at).getTime();
  const hours = Math.max(0, (now - prev) / 3600000);

  const hunger = Math.max(0, pet.hunger - Math.floor(hours * 6));
  const cleanliness = Math.max(0, pet.cleanliness - Math.floor(hours * 4));

  let energy = pet.energy;
  if (pet.state === "sleeping") energy = Math.min(100, pet.energy + Math.floor(hours * 10));
  else energy = Math.max(0, pet.energy - Math.floor(hours * 5));

  const penalty =
    (hunger < 30 ? 8 : 0) +
    (cleanliness < 30 ? 6 : 0) +
    (energy < 30 ? 8 : 0);

  const mood = Math.max(0, Math.min(100, pet.mood - Math.floor(hours * (2 + penalty / 10))));

  return { ...pet, hunger, cleanliness, energy, mood, updated_at: nowIso() };
}

module.exports = { nowIso, applyTimeDecay };