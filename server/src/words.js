// Word pairs for the Undercover game.
// Each pair has a "civilian" word (given to the majority) and an "undercover"
// word (given to the minority). They're similar enough that a good clue for
// one often also fits the other, which is where the fun/bluffing comes from.

export const WORD_PAIRS = [
  { category: "Food", civilian: "Pizza", undercover: "Burger" },
  { category: "Food", civilian: "Coffee", undercover: "Tea" },
  { category: "Food", civilian: "Ice Cream", undercover: "Yogurt" },
  { category: "Food", civilian: "Noodles", undercover: "Rice" },
  { category: "Food", civilian: "Cake", undercover: "Pie" },
  { category: "Food", civilian: "Mango", undercover: "Papaya" },
  { category: "Animals", civilian: "Lion", undercover: "Tiger" },
  { category: "Animals", civilian: "Dog", undercover: "Wolf" },
  { category: "Animals", civilian: "Cat", undercover: "Fox" },
  { category: "Animals", civilian: "Dolphin", undercover: "Shark" },
  { category: "Animals", civilian: "Eagle", undercover: "Hawk" },
  { category: "Animals", civilian: "Horse", undercover: "Zebra" },
  { category: "Places", civilian: "Beach", undercover: "Desert" },
  { category: "Places", civilian: "School", undercover: "Library" },
  { category: "Places", civilian: "Airport", undercover: "Train Station" },
  { category: "Places", civilian: "Mountain", undercover: "Hill" },
  { category: "Places", civilian: "Hospital", undercover: "Clinic" },
  { category: "Objects", civilian: "Phone", undercover: "Tablet" },
  { category: "Objects", civilian: "Umbrella", undercover: "Raincoat" },
  { category: "Objects", civilian: "Guitar", undercover: "Violin" },
  { category: "Objects", civilian: "Clock", undercover: "Calendar" },
  { category: "Objects", civilian: "Backpack", undercover: "Suitcase" },
  { category: "Sports", civilian: "Football", undercover: "Rugby" },
  { category: "Sports", civilian: "Basketball", undercover: "Volleyball" },
  { category: "Sports", civilian: "Tennis", undercover: "Badminton" },
  { category: "Sports", civilian: "Swimming", undercover: "Diving" },
  { category: "Movies & Shows", civilian: "Superhero Movie", undercover: "Action Movie" },
  { category: "Movies & Shows", civilian: "Cartoon", undercover: "Anime" },
  { category: "Movies & Shows", civilian: "Sitcom", undercover: "Reality Show" },
  { category: "Jobs", civilian: "Doctor", undercover: "Nurse" },
  { category: "Jobs", civilian: "Teacher", undercover: "Professor" },
  { category: "Jobs", civilian: "Chef", undercover: "Baker" },
  { category: "Weather", civilian: "Rain", undercover: "Storm" },
  { category: "Weather", civilian: "Snow", undercover: "Hail" },
  { category: "Nature", civilian: "River", undercover: "Lake" },
  { category: "Nature", civilian: "Forest", undercover: "Jungle" },
];

export function getCategories() {
  return [...new Set(WORD_PAIRS.map((p) => p.category))];
}

export function pickWordPair(category) {
  const pool =
    category && category !== "random"
      ? WORD_PAIRS.filter((p) => p.category === category)
      : WORD_PAIRS;
  const list = pool.length ? pool : WORD_PAIRS;
  return list[Math.floor(Math.random() * list.length)];
}

// A host-supplied word list (inside jokes, names, whatever the group finds
// funny) instead of the built-in categories. Unlike WORD_PAIRS these aren't
// curated as "similar" pairs — any two distinct words from the list are
// picked at random, which is the point: it's personal, not balanced.
export function pickCustomPair(words) {
  const pool = [...new Set((words || []).map((w) => w.trim()).filter(Boolean))];
  if (pool.length < 2) return null;

  const i = Math.floor(Math.random() * pool.length);
  let j = Math.floor(Math.random() * (pool.length - 1));
  if (j >= i) j += 1; // pick a second, distinct index without retry-looping

  return { category: "Custom", civilian: pool[i], undercover: pool[j] };
}
