# Voice recording script

Recording takes about 25 minutes, in 15 takes of 1 to 2 minutes each: one reference clip (T00), 12 training takes (T01 to T12) and 2 held-out takes (H1, H2). That gives a fine-tune about 12 minutes of clean speech. Consistency (same room, same distance, same voice) matters more than recording extra.

None of this is the narration of your films: your voice model reads that. **If you only want the quick clone** (any Mac with 16 GB or more), record T00 alone; add H1 and H2 if you want it scored. **For a fine-tune** (a Mac with 32 GB or more), record everything, in this order if you run short of time: T00 and T01 first, then H1 and H2 (needed for scoring), then T04 to T07, then the rest.

## How to record

**Set up the iPhone once**

- Settings › Apps › Voice Memos › Audio Quality: **Lossless**.
- Turn on Do Not Disturb or Airplane Mode, so no buzz or ring lands in a take.
- Never use Voice Memos' **Enhance Recording** or any mic mode. The kit cleans the audio itself.

**The room and the phone**

- A small, soft room: a bedroom with a bed, curtains and a rug, or a closet full of clothes. Not a kitchen or a bathroom.
- No music, TV, fan, dishwasher or open window.
- The phone stands still, on a stand or a stack of books, about 20 cm (a hand-span) from your mouth, bottom edge toward you, a little off to the side so P and B sounds don't pop.
- Same chair, same spot, same distance for every take.
- Water nearby. Sit up.

**How to read**

- Use your **narration voice**: friendly, clear, explaining something to a curious friend. Same energy in every take, a touch slower than conversation.
- Read naturally; don't perform each word. Pause briefly between sentences.
- A slip: stop, pause two seconds, and say the whole sentence again. The checker cuts the slip. Redo the whole take only if it's full of them.

**Each take**

1. New memo. Stay **silent for 3 seconds** (that's the noise profile).
2. Say the take's number, for example "Take five", then read it.
3. Stay silent for 2 seconds, then stop.
4. Rename the memo to the number, for example `T05`.
5. Get it to your Mac: Share › **Save to Files** › iCloud Drive › a folder named **explainer-kit-takes**, or AirDrop it.

The recordings stay on your own devices; nothing goes to any other service. Claude checks each take as it lands and tells you whether to redo it. Send T00 and T01 first, so the setup can be checked before you record the rest.

## T00 · Reference clip (about 10 s)

This is the clip the quick clone copies, so read it in your best, most natural narration voice. Read it three times in the one memo, with a 2-second pause between readings; the checker keeps the cleanest one.

> Hello, and thanks for joining me. Over the next few minutes, I'll walk you through one idea, step by step, with a picture for each part. Let's begin.

## T01–T03 · General sentences

These are the Harvard sentences, a standard set that covers the sounds of English. Read them as plain statements, in the same friendly voice, with a short pause after each.

**T01**

1. The birch canoe slid on the smooth planks.
2. Glue the sheet to the dark blue background.
3. It's easy to tell the depth of a well.
4. These days a chicken leg is a rare dish.
5. Rice is often served in round bowls.
6. The juice of lemons makes fine punch.
7. The box was thrown beside the parked truck.
8. Four hours of steady work faced us.
9. A large size in stockings is hard to sell.
10. The boy was there when the sun rose.
11. A rod is used to catch pink salmon.
12. The source of the huge river is the clear spring.
13. Kick the ball straight and follow through.
14. Help the woman get back to her feet.
15. A pot of tea helps to pass the evening.
16. Smoky fires lack flame and heat.
17. The soft cushion broke the man's fall.
18. The salt breeze came across from the sea.
19. The girl at the booth sold fifty bonds.
20. The small pup gnawed a hole in the sock.

**T02**

1. The fish twisted and turned on the bent hook.
2. Press the pants and sew a button on the vest.
3. The swan dive was far short of perfect.
4. The beauty of the view stunned the young boy.
5. Two blue fish swam in the tank.
6. Her purse was full of useless trash.
7. The colt reared and threw the tall rider.
8. It snowed, rained, and hailed the same morning.
9. Read verse out loud for pleasure.
10. Hoist the load to your left shoulder.
11. Take the winding path to reach the lake.
12. Note closely the size of the gas tank.
13. Wipe the grease off his dirty face.
14. Mend the coat before you go out.
15. The wrist was badly strained and hung limp.
16. The stray cat gave birth to kittens.
17. The young girl gave no clear response.
18. The meal was cooked before the bell rang.
19. What joy there is in living.
20. A king ruled the state in the early days.

**T03**

1. The ship was torn apart on the sharp reef.
2. Sickness kept him home the third week.
3. The wide road shimmered in the hot sun.
4. The lazy cow lay in the cool grass.
5. Lift the square stone over the fence.
6. The rope will bind the seven books at once.
7. Hop over the fence and plunge in.
8. Mesh wire keeps chicks inside.
9. The frosty air passed through the coat.
10. The crooked maze failed to fool the mouse.
11. The pipe began to rust while new.
12. Open the crate but don't break the glass.
13. Add the sum to the product of these three.
14. The ripe taste of cheese improves with age.
15. Act on these orders with great speed.
16. The hog crawled under the high fence.
17. Move the vat over the hot fire.
18. The bark of the pine tree was shiny and dark.
19. Leaves turn brown and yellow in the fall.
20. Split the log with a quick, sharp blow.

## T04–T07 · Narration

This is the voice the model learns most from. Read each line as if the film were playing: warm, clear, a little slower than talking, a small pause between lines.

**T04 · How a bridge holds up**

1. Every bridge has one job: to carry a load from one bank to the other without falling down.
2. A plank across a stream is the simplest kind, and it bends a little as you walk across it.
3. The top of the plank is squeezed, and the bottom is stretched.
4. An arch turns that problem around, so every stone is pushed against its neighbors.
5. Stone is strong when it's squeezed, which is why Roman arches are still standing.
6. A suspension bridge hangs its road from cables, and the cables pull on towers at each end.
7. So the real question is never just how strong a bridge is, but where its forces go.
8. Once you can see that, every bridge you drive across starts to look a little different.

**T05 · Why bread rises**

1. Bread starts as four plain things: flour, water, salt and yeast.
2. Yeast is alive, and when it's warm and fed, it breathes out tiny bubbles of gas.
3. Kneading the dough builds a stretchy web called gluten, which traps those bubbles.
4. Leave it in a warm spot for an hour, and the dough slowly doubles in size.
5. In the oven, the bubbles swell one last time before the crust sets around them.
6. That's why a good loaf is full of holes, and why a cold kitchen makes a heavy one.
7. Too much salt slows the yeast down, and too little lets it run wild.
8. Bakers have been balancing those few things for thousands of years.
9. Next time you slice a loaf, look closely at the holes; each one is a tiny breath.

**T06 · Reading a map**

1. A map is a flat picture of a round world, and that's harder than it sounds.
2. Try flattening an orange peel, and you'll see the problem right away.
3. Something always has to stretch, tear, or squash.
4. The map most of us grew up with keeps directions true, but it makes the far north look enormous.
5. On that map, Greenland looks about as big as Africa.
6. In fact, Africa is roughly fourteen times larger.
7. Other maps keep areas true instead, and their shapes look oddly stretched.
8. There's no perfect choice, only a choice that suits the question you're asking.

**T07 · Wrapping up**

1. So that's the whole idea, from the first step to the last.
2. If one part went by too quickly, go back and watch it again; it's only a few minutes.
3. The best way to remember it is to explain it to someone else.
4. Thanks for watching, and I'll see you in the next one.
5. Until then, keep asking how things work.

## T08–T09 · Names, numbers and spelled words

These teach the model how you say names, numbers and letters. Say each line the way you'd say it in a film; letters in capitals are spelled out. If your films will keep using particular names or terms, you can swap some of these lines for your own (then ask Claude to rebuild the takes list).

**T08 · Names and places**

1. Maria and Daniel met Priya at the station in Lisbon.
2. Kenji flew from Osaka to Chicago, then drove on to Milwaukee.
3. Olivia's grandmother grew up in a village outside Nairobi.
4. The letter was signed by Professor Hannah Okafor and her colleague, Luis Romero.
5. We spent a week in Melbourne, two days in Wellington, and one night in Auckland.
6. Ask Sofia, or ask Mateo; one of them will know.
7. The river runs from the Swiss Alps, past Basel, all the way to Rotterdam.
8. Charlotte, Ahmed, Elena and Tom sat at the corner table.
9. The museum in Edinburgh has a whole room about the Vikings.
10. My neighbor Rosa keeps bees on her roof in Brooklyn.
11. Isaac Newton, Marie Curie and Ada Lovelace changed how we see the world.
12. Turn left at Elm Street, then right onto Harbor Road.

**T09 · Numbers, dates and letters**

1. The train leaves at seven forty-five and arrives just after nine.
2. A liter of water weighs one kilogram.
3. The tower is three hundred and thirty meters tall.
4. She was born on the fourth of July, nineteen eighty-two.
5. Prices went up by about twelve percent last year.
6. Call me back on Tuesday, between two and four in the afternoon.
7. The recipe needs two and a half cups of flour and one egg.
8. The light from the sun takes about eight minutes to reach us.
9. Chapter eleven begins on page two hundred and six.
10. The team sent the data to the BBC, the UN and the EU.
11. Our flight number is BA two seven one, from gate fourteen.
12. It was minus five outside, and the wind made it feel like minus twelve.
13. The first, the second, the twenty-third and the hundredth.
14. A quarter, a half, three quarters, and the whole thing.
15. The year two thousand was a leap year, but nineteen hundred was not.

## T10–T12 · Conversational

Looser and more natural, as if you were talking with a friend. Questions should sound like questions; lists should sound like lists.

**T10 · Telling a friend**

Okay, so you know how I said I'd finally fix the bike? Well, I did. Sort of. The chain kept slipping, so I watched a few videos and bought a new one. It took me most of Saturday afternoon. Turns out the chain was fine; the problem was a loose bolt on the back wheel. One bolt! I tightened it in about thirty seconds. So now I have a spare chain, a clean bike, and a slightly bruised ego. Honestly, though, I learned more from getting it wrong than I would have if it had just worked.

**T11 · Questions, lists and reactions**

1. Have you been there before?
2. Wait, which way did you say we turn?
3. Would you rather walk, or should we take the bus?
4. Why does it always rain on the weekend?
5. Really? That's all it takes? That was easy.
6. Oh, nice. I didn't know you could do that.
7. Hmm. Let me think about that for a second.
8. You'll need three things: a pencil, a ruler, and about ten minutes.
9. First, fold the paper in half. Then, open it up. Finally, fold each corner to the middle.
10. It isn't magic. It's just practice.
11. Red, orange, yellow, green, blue, indigo, violet.
12. Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.
13. One, two, three, four, five, six, seven, eight, nine, ten.
14. Eleven, twenty, thirty-three, a hundred, a thousand, a million.
15. It's a quarter past ten on a Thursday morning in early spring.

**T12 · A short explanation**

People often ask why the sky is blue. The short answer is that sunlight is a mix of every color, and the air scatters some colors more than others. Blue light has a short wavelength, so it bounces around the sky much more than red light does. Wherever you look, some of that scattered blue is heading toward your eyes. So why are sunsets orange? When the sun is low, its light crosses far more air to reach you. By then, most of the blue has been scattered away, and the reds and oranges are what's left. It's the same sunlight, just taking a longer road.

## H1–H2 · Held out for scoring

The model never trains on these. Each fine-tune reads the same lines, and the scorer compares it with your real recording. Same narration voice as T04 to T07.

**H1 · Why leaves change color**

1. All summer long, a leaf is green because it's full of chlorophyll.
2. Chlorophyll catches sunlight and turns it into food for the tree.
3. When the days get shorter, the tree stops making it.
4. As the green fades, the yellows and oranges that were there all along start to show.
5. Some trees also make new red colors in the autumn, which is why maples look like they're on fire.
6. A few weeks later, the leaves fall, and the tree rests until spring.

**H2 · How a lock and key work**

1. Look inside an ordinary door lock, and you'll find a row of tiny pins.
2. Each pin is split into two pieces, and they come in different lengths.
3. Springs push the pins down, so they block the cylinder from turning.
4. When the right key slides in, its ridges lift every pin to exactly the right height.
5. The splits line up along the edge of the cylinder, and it's free to turn.
6. The wrong key lifts some pins too far and others not far enough.
7. That's the whole trick: a handful of pins, and one key that fits them all.
