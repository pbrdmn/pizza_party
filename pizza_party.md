🍕Game: Pizza Party

A collaborative, cooperative pizza making game.

I want to create the game as a web application using threeJS and websockets or similar.
No auth, but can "Host a game" to generate a 6 digit lobby code or "Join a game" to enter a 6 digit lobby code. Lobbies can hold any number of players. Players can choose "I'm just here to watch" and observe the game without playing. There will be a chat feature too, but that can be hidden/collapsed, just showing an "unread messages" count on the icon.

Goal: match a target configuration by pushing toppings from the edges to match a pattern.

Board is a pizza with square grid for topping. The pizza rotates between players turns so any number of players can join, pushing a topping from their front edge onto the pizza.

The round starts with a ball of dough.

The players take turns rolling it until it's large enough to cover the ingredient grid, not required to be circular. Once the play area has been covered, the sauce is applied, then the players take turn making ingredients.

Taking a turn: players have a selection of toppings to choose from and can only push one topping into one row from the side of the pizza facing them on their turn. This topping will push other toppings along that row. If the row is full, the last item in the row will fall off the pizza. Players cannot skip a turn.

The pattern match can be in any orientation, e.g. rotated pizza will still match.

Metrics: Track time to make the pizza, then it slides into the oven. Track number of turns taken.

Game modes: Pizza party - cook a set number of pizzas. Rush hour - time limit, cook as many pizzas as you can before the time is up. Chefs Special - create your own pizzas.
 
Bonus challenge - cooking: players tap to cook the pizza, each cooking from a different angle, need to tap evenly for the pizza to be cooked evenly. Tap too fast and pizza starts to burn, too slow and the pizza will not cook? Or just number of taps?

Difficulties: set the size of the pizza (5-9), and a recipe. Recipies can be chosen based on difficulty, which will then generate the random pizza topping pattern required. E.g. a cheese pizza is all cheese, a salami pizza has a patten of salami pieces to match, with cheese covering the rest, a hawaiian pizza has a ham and pineapple pizza, with cheese covering the rest.

Example Small (5) pizza. Corners are empty to match pizza's roundness
⬛🧀🧀🧀⬛
🧀🍖🧀🍖🧀
🧀🧀🍖🧀🧀
🧀🍖🧀🍖🧀
⬛🧀🧀🧀⬛

Example Medium (7) pizza. Corners are empty to match pizza's roundness
⬛🧀🧀🧀🧀🧀⬛
🧀🧀🍖🧀🍖🧀🧀
🧀🍖🧀🍖🧀🍖🧀
🧀🧀🍖🧀🍖🧀🧀
🧀🍖🧀🍖🧀🍖🧀
🧀🧀🍖🧀🍖🧀🧀
⬛🧀🧀🧀🧀🧀⬛

Example Large (9) "Hawaiian" pizza. Corners are empty to match pizza's roundness
⬛⬛🧀🧀🧀🧀🧀⬛⬛
⬛🧀🐷🧀🍍🧀🐷🧀⬛
🧀🐷🧀🍍🧀🐷🧀🍍🧀
🧀🧀🍍🧀🐷🧀🍍🧀🧀
🧀🍍🧀🐷🧀🍍🧀🐷🧀
🧀🧀🐷🧀🍍🧀🐷🧀🧀
🧀🐷🧀🍍🧀🐷🧀🍍🧀
⬛🧀🍍🧀🐷🧀🍍🧀⬛
⬛⬛🧀🧀🧀🧀🧀⬛⬛

