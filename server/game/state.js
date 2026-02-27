function computeMoodState(pet) {
  if (pet.state === "sleeping") return "sleeping";
  if (pet.hunger < 25) return "hungry";
  if (pet.cleanliness < 25) return "dirty";
  if (pet.energy < 25) return "tired";
  if (pet.mood < 25) return "sad";
  if (pet.hunger > 70 && pet.cleanliness > 70 && pet.energy > 70 && pet.mood > 70) return "happy";
  return "ok";
}

module.exports = { computeMoodState };