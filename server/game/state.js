// server/game/state.js
function computeMoodState(pet) {
  // Определяем статус питомца
  if (pet.state === "sleeping") return "sleeping";
  if (pet.hunger < 25) return "hungry";
  if (pet.cleanliness < 25) return "dirty";
  if (pet.energy < 25) return "tired";
  if (pet.mood < 25) return "sad";
  
  // Если все параметры высокие, питомец счастлив
  if (pet.hunger > 70 && pet.cleanliness > 70 && pet.energy > 70 && pet.mood > 70) {
    return "happy";  // Возвращаем "happy" как состояние
  }

  return "ok";  // Если никаких проблем нет, возвращаем "ok"
}

function computeVisualState(pet) {
  // Дополнительная логика для визуальных состояний (картинок питомца)
  if (pet.state === "sleeping") return "mid";   // Состояние "спящий" будет отображаться как "mid"
  if (pet.hunger < 25) return "bad";            // Состояние "голоден" будет отображаться как "bad"
  if (pet.energy < 25) return "bad";            // Состояние "устал" будет отображаться как "bad"
  if (pet.mood < 25) return "bad";              // Состояние "грустный" будет отображаться как "bad"
  
  // Если все параметры высокие, питомец счастлив и его изображение "happy"
  if (pet.hunger > 70 && pet.cleanliness > 70 && pet.energy > 70 && pet.mood > 70) {
    return "good";  // Состояние "счастлив" будет отображаться как "good"
  }

  return "mid"; // Если ни одно из состояний не подходит, по умолчанию "mid"
}

module.exports = { computeMoodState, computeVisualState };