import { todayISO, addDays } from '../lib/date.js'
import { earnedBadges, levelFromXp } from '../lib/gamify.js'

const id = (p, n) => `${p}_${n}`

/**
 * Starter family — everything here is editable in the app (Family → Manage).
 * Two parents + five kids = the 7-member household.
 */
export function buildSeed() {
  const t = todayISO()

  const members = [
    { id: 'm1', name: 'Dad',   emoji: '🧔', color: '#4cc9f0', role: 'parent', pin: '1234', xp: 0,    coins: 0,   streak: 0,  lastDoneISO: null,        badges: [], totalApproved: 0,  jobsDone: 0, perfectScores: 0, born: null },
    { id: 'm2', name: 'Mom',   emoji: '👩', color: '#ff5d8f', role: 'parent', pin: '1234', xp: 0,    coins: 0,   streak: 0,  lastDoneISO: null,        badges: [], totalApproved: 0,  jobsDone: 0, perfectScores: 0, born: null },
    { id: 'm3', name: 'Ava',   emoji: '🦄', color: '#a06cff', role: 'child',  pin: null,   xp: 1240, coins: 310, streak: 6,  lastDoneISO: addDays(t, -1), badges: [], totalApproved: 46, jobsDone: 7, perfectScores: 4, born: 2011 },
    { id: 'm4', name: 'Micah', emoji: '🦖', color: '#63e6a5', role: 'child',  pin: null,   xp: 880,  coins: 145, streak: 3,  lastDoneISO: addDays(t, -1), badges: [], totalApproved: 31, jobsDone: 4, perfectScores: 2, born: 2013 },
    { id: 'm5', name: 'Ella',  emoji: '🐬', color: '#ff9f1c', role: 'child',  pin: null,   xp: 1510, coins: 480, streak: 11, lastDoneISO: addDays(t, -1), badges: [], totalApproved: 58, jobsDone: 9, perfectScores: 6, born: 2015 },
    { id: 'm6', name: 'Owen',  emoji: '🐢', color: '#ffd60a', role: 'child',  pin: null,   xp: 420,  coins: 90,  streak: 1,  lastDoneISO: addDays(t, -1), badges: [], totalApproved: 17, jobsDone: 2, perfectScores: 1, born: 2017 },
    { id: 'm7', name: 'Rosie', emoji: '🐝', color: '#ff5c5c', role: 'child',  pin: null,   xp: 160,  coins: 35,  streak: 2,  lastDoneISO: addDays(t, -1), badges: [], totalApproved: 8,  jobsDone: 0, perfectScores: 0, born: 2019 },
  ]

  // Back-fill the badges their history would already have earned, so nobody
  // gets a surprise pile of them on their very first approval.
  members.forEach((m) => {
    m.badges = earnedBadges({
      approved: m.totalApproved, streak: m.streak, jobsDone: m.jobsDone,
      perfectScores: m.perfectScores, coins: m.coins, level: levelFromXp(m.xp).level,
    })
  })

  const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]
  const SCHOOL = [1, 2, 3, 4, 5]
  const WEEKEND = [0, 6]

  const chores = [
    // Ava
    { id: id('c', 1),  title: 'Make your bed',           emoji: '🛏️', memberId: 'm3', days: EVERY_DAY, time: '07:15', points: 10, coins: 2,  needsPhoto: true,  referencePhotoId: null, checklist: ['Pillows at the head', 'Blanket pulled flat', 'Nothing on the floor'], room: 'Bedroom' },
    { id: id('c', 2),  title: 'Unload the dishwasher',   emoji: '🍽️', memberId: 'm3', days: [1, 3, 5],  time: '17:30', points: 20, coins: 5,  needsPhoto: true,  referencePhotoId: null, checklist: ['Racks empty', 'Counters clear'], room: 'Kitchen' },
    { id: id('c', 3),  title: 'Homework check-in',       emoji: '📚', memberId: 'm3', days: SCHOOL,     time: '16:00', points: 15, coins: 0,  needsPhoto: false, referencePhotoId: null, checklist: [], room: 'Desk' },

    // Micah
    { id: id('c', 4),  title: 'Make your bed',           emoji: '🛏️', memberId: 'm4', days: EVERY_DAY, time: '07:15', points: 10, coins: 2,  needsPhoto: true,  referencePhotoId: null, checklist: ['Pillows at the head', 'Blanket pulled flat'], room: 'Bedroom' },
    { id: id('c', 5),  title: 'Take out the trash',      emoji: '🗑️', memberId: 'm4', days: [1, 4],     time: '18:00', points: 25, coins: 6,  needsPhoto: true,  referencePhotoId: null, checklist: ['Bin at the curb', 'New bag in the can'], room: 'Kitchen' },
    { id: id('c', 6),  title: 'Feed the dog',            emoji: '🐕', memberId: 'm4', days: EVERY_DAY, time: '07:45', points: 10, coins: 2,  needsPhoto: false, referencePhotoId: null, checklist: [], room: 'Mudroom' },

    // Ella
    { id: id('c', 7),  title: 'Make your bed',           emoji: '🛏️', memberId: 'm5', days: EVERY_DAY, time: '07:15', points: 10, coins: 2,  needsPhoto: true,  referencePhotoId: null, checklist: ['Pillows at the head', 'Blanket pulled flat'], room: 'Bedroom' },
    { id: id('c', 8),  title: 'Wipe down the table',     emoji: '🧽', memberId: 'm5', days: EVERY_DAY, time: '18:45', points: 15, coins: 3,  needsPhoto: true,  referencePhotoId: null, checklist: ['No crumbs', 'Chairs pushed in'], room: 'Dining room' },
    { id: id('c', 9),  title: 'Practice piano',          emoji: '🎹', memberId: 'm5', days: [1, 2, 3, 4], time: '16:30', points: 20, coins: 4, needsPhoto: false, referencePhotoId: null, checklist: [], room: 'Living room' },

    // Owen
    { id: id('c', 10), title: 'Make your bed',           emoji: '🛏️', memberId: 'm6', days: EVERY_DAY, time: '07:20', points: 10, coins: 2,  needsPhoto: true,  referencePhotoId: null, checklist: ['Pillows at the head', 'Blanket pulled flat'], room: 'Bedroom' },
    { id: id('c', 11), title: 'Toys off the living room floor', emoji: '🧸', memberId: 'm6', days: EVERY_DAY, time: '19:00', points: 15, coins: 3, needsPhoto: true, referencePhotoId: null, checklist: ['Floor clear', 'Bins closed'], room: 'Living room' },
    { id: id('c', 12), title: 'Backpack by the door',    emoji: '🎒', memberId: 'm6', days: SCHOOL,     time: '19:30', points: 10, coins: 2,  needsPhoto: false, referencePhotoId: null, checklist: [], room: 'Entry' },

    // Rosie
    { id: id('c', 13), title: 'Put pajamas in the hamper', emoji: '🧺', memberId: 'm7', days: EVERY_DAY, time: '07:30', points: 8, coins: 1, needsPhoto: false, referencePhotoId: null, checklist: [], room: 'Bedroom' },
    { id: id('c', 14), title: 'Books back on the shelf', emoji: '📖', memberId: 'm7', days: WEEKEND,    time: '10:00', points: 12, coins: 2,  needsPhoto: true,  referencePhotoId: null, checklist: ['Shelf tidy', 'Nothing under the bed'], room: 'Bedroom' },

    // Parents keep their own recurring items on the board too
    { id: id('c', 15), title: 'Meal plan for the week',  emoji: '🥗', memberId: 'm2', days: [0],        time: '15:00', points: 30, coins: 0,  needsPhoto: false, referencePhotoId: null, checklist: [], room: 'Kitchen' },
    { id: id('c', 16), title: 'Trash + recycling to curb', emoji: '♻️', memberId: 'm1', days: [1],      time: '20:00', points: 20, coins: 0,  needsPhoto: false, referencePhotoId: null, checklist: [], room: 'Garage' },
  ]

  const events = [
    { id: id('e', 1), memberId: 'm3', title: 'Soccer practice', emoji: '⚽', days: [2, 4], start: '17:30', end: '19:00', category: 'sport' },
    { id: id('e', 2), memberId: 'm3', title: 'School',          emoji: '🏫', days: SCHOOL, start: '08:00', end: '15:10', category: 'school' },
    { id: id('e', 3), memberId: 'm4', title: 'School',          emoji: '🏫', days: SCHOOL, start: '08:00', end: '15:10', category: 'school' },
    { id: id('e', 4), memberId: 'm4', title: 'Karate',          emoji: '🥋', days: [1, 3], start: '17:00', end: '18:00', category: 'sport' },
    { id: id('e', 5), memberId: 'm5', title: 'School',          emoji: '🏫', days: SCHOOL, start: '08:00', end: '15:10', category: 'school' },
    { id: id('e', 6), memberId: 'm5', title: 'Piano lesson',    emoji: '🎹', days: [3],    start: '16:00', end: '16:45', category: 'music' },
    { id: id('e', 7), memberId: 'm6', title: 'School',          emoji: '🏫', days: SCHOOL, start: '08:15', end: '14:45', category: 'school' },
    { id: id('e', 8), memberId: 'm7', title: 'Preschool',       emoji: '🎨', days: [2, 4], start: '09:00', end: '12:00', category: 'school' },
    { id: id('e', 9), memberId: 'm1', title: 'Work',            emoji: '💼', days: SCHOOL, start: '08:30', end: '17:30', category: 'work' },
    { id: id('e', 10), memberId: 'm2', title: 'Work',           emoji: '💼', days: [1, 2, 3], start: '09:00', end: '16:00', category: 'work' },
    { id: id('e', 11), memberId: 'm3', title: 'Youth group',    emoji: '🙌', days: [3],    start: '18:30', end: '20:00', category: 'other' },
    { id: id('e', 12), memberId: 'm5', title: 'Swim team',      emoji: '🏊', days: [6],    start: '09:00', end: '10:30', category: 'sport' },
  ]

  const jobs = [
    { id: id('j', 1), title: 'Sweep out the garage',      notes: 'Whole floor, including behind the bikes. Bring the shop vac back inside when done.', photoId: null, referencePhotoId: null, points: 60, coins: 15, createdBy: 'm1', createdAt: t, dueISO: addDays(t, 3), claimedBy: null, status: 'open', urgent: false },
    { id: id('j', 2), title: 'Pull weeds along the fence', notes: 'Front side only. Bag them and leave the bag by the gate.', photoId: null, referencePhotoId: null, points: 45, coins: 12, createdBy: 'm2', createdAt: t, dueISO: addDays(t, 5), claimedBy: null, status: 'open', urgent: false },
    { id: id('j', 3), title: 'Match and fold the sock basket', notes: 'The giant basket in the laundry room.', photoId: null, referencePhotoId: null, points: 30, coins: 8, createdBy: 'm2', createdAt: t, dueISO: addDays(t, 2), claimedBy: 'm4', status: 'claimed', urgent: false },
    { id: id('j', 4), title: 'Wipe fingerprints off the back slider', notes: 'Both sides. Glass cleaner is under the sink.', photoId: null, referencePhotoId: null, points: 25, coins: 6, createdBy: 'm1', createdAt: t, dueISO: addDays(t, 1), claimedBy: null, status: 'open', urgent: true },
  ]

  const prizes = [
    { id: id('p', 1), title: 'Movie night pick',        emoji: '🍿', cost: 150,  memberId: null, note: 'You choose the movie AND the snack.', redeemed: [] },
    { id: id('p', 2), title: 'Stay up 30 min late',     emoji: '🌙', cost: 200,  memberId: null, note: 'One school night, parent approved.',   redeemed: [] },
    { id: id('p', 3), title: 'Friend sleepover',        emoji: '🏕️', cost: 600,  memberId: null, note: 'Weekend only.',                        redeemed: [] },
    { id: id('p', 4), title: 'New soccer cleats',       emoji: '👟', cost: 1200, memberId: 'm3', note: "Ava's goal — the ones she picked out.", redeemed: [] },
    { id: id('p', 5), title: 'Lego set of your choice', emoji: '🧱', cost: 1000, memberId: 'm4', note: 'Under $60.',                            redeemed: [] },
    { id: id('p', 6), title: 'Day at the water park',   emoji: '🌊', cost: 900,  memberId: null, note: 'Anyone who saves up.',                  redeemed: [] },
  ]

  const familyGoals = [
    { id: id('g', 1), title: 'Family beach weekend', emoji: '🏖️', target: 4000, progress: 1580, reward: 'Two nights at the coast — everyone picks one activity.', createdAt: t, achievedAt: null },
    { id: id('g', 2), title: 'Pizza + arcade night', emoji: '🕹️', target: 1200, progress: 940,  reward: 'Dinner out and $10 of tokens each.',                    createdAt: t, achievedAt: null },
  ]

  return {
    version: 1,
    members,
    chores,
    events,
    jobs,
    prizes,
    familyGoals,
    submissions: [],
    activity: [
      { id: 'a1', at: Date.now() - 3600e3, memberId: 'm5', text: 'earned 15 pts for Wipe down the table', emoji: '🧽' },
      { id: 'a2', at: Date.now() - 7200e3, memberId: 'm3', text: 'hit a 6-day streak', emoji: '🔥' },
      { id: 'a3', at: Date.now() - 9600e3, memberId: 'm4', text: 'claimed Match and fold the sock basket', emoji: '🎯' },
    ],
    settings: {
      currentMemberId: 'm3',
      parentUnlocked: false,
      requirePin: true,
      soundOn: true,
    },
  }
}
