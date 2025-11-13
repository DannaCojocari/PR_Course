/* Copyright (c) 2021-25 MIT 6.102/6.031 course staff, all rights reserved.
 * Redistribution of original or derived work requires permission of course staff.
 */

import { Board } from './board.js';

/**
 * Example code for simulating a game.
 * 
 * PS4 instructions: you may use, modify, or remove this file,
 *   completing it is recommended but not required.
 * 
 * @throws Error if an error occurs reading or parsing the board
 */
async function simulationMain(): Promise<void> {
    const filename = 'boards/big_board.txt';
    const board: Board = await Board.parseFromFile(filename);
    const players = 4;
    const tries = 100;
    const maxDelayMilliseconds = 200;
    const flipTimeoutMilliseconds = 2000;

    type PlayerStats = {
        playerId: string;
        moves: number;
        moveDurationsMs: number[]; // per attempt (one attempt includes up to 2 flips)
        successfulFlips: number; // counts each successful flip call
        failedFlips: number;     // counts each failed flip call
        flipErrors: Map<string, number>; // error message -> count
    };

    const statsByPlayer = new Map<string, PlayerStats>();

    function getStats(playerId: string): PlayerStats {
        let st = statsByPlayer.get(playerId);
        if (!st) {
            st = {
                playerId,
                moves: 0,
                moveDurationsMs: [],
                successfulFlips: 0,
                failedFlips: 0,
                flipErrors: new Map(),
            };
            statsByPlayer.set(playerId, st);
        }
        return st;
    }

    // start up one or more players as concurrent asynchronous function calls
    const playerPromises: Array<Promise<void>> = [];
    for (let ii = 0; ii < players; ++ii) {
        playerPromises.push(player(ii, board, flipTimeoutMilliseconds));
    }
    // wait for all the players to finish (unless one throws an exception)
    await Promise.all(playerPromises);
    console.log('Simulation complete');

    printSummary();

    /** @param playerNumber player to simulate */
    async function player(playerNumber: number, board: Board, flipTimeoutMilliseconds: number): Promise<void> {
        const playerId = String('player' + playerNumber);
        console.log(`Player [${playerId}] starting`);
        const st = getStats(playerId);

        const height = board.getHeight();
        const width = board.getWidth();

        for (let jj = 0; jj < tries; ++jj) {
            // record move start time
            const moveStart = Date.now();
            st.moves += 1;

            try {
                await timeout(Math.random() * maxDelayMilliseconds);
                const row1 = randomInt(height);
                const col1 = randomInt(width);
                console.log(`Player [${playerId}] attempt ${jj}: first flip at (${row1},${col1})`);
                
                try {
                    const flipStart = Date.now();
                    await board.flip(playerId, row1, col1);
                    const flipDuration = Date.now() - flipStart;
                    st.successfulFlips += 1;
                    console.log(`Player [${playerId}] first flip succeeded at (${row1},${col1}) (flip time ${flipDuration} ms)`);
                } catch (err) {
                    st.failedFlips += 1;
                    const emsg = formatError(err);
                    st.flipErrors.set(emsg, (st.flipErrors.get(emsg) ?? 0) + 1);
                    console.error(`Player [${playerId}] first flip failed at (${row1},${col1}):`, emsg);
                    // record move duration and continue to next attempt
                    const moveDuration = Date.now() - moveStart;
                    st.moveDurationsMs.push(moveDuration);
                    continue; // try again (counts as one move)
                }

                await timeout(Math.random() * maxDelayMilliseconds);
                const row2 = randomInt(height);
                const col2 = randomInt(width);
                console.log(`Player [${playerId}] attempt ${jj}: second flip at (${row2},${col2})`);
                
                try {
                    const flipStart = Date.now();
                    await board.flip(playerId, row2, col2);
                    const flipDuration = Date.now() - flipStart;
                    st.successfulFlips += 1;
                    console.log(`Player [${playerId}] second flip succeeded at (${row2},${col2}) (flip time ${flipDuration} ms)`);
                } catch (err) {
                    st.failedFlips += 1;
                    const emsg = formatError(err);
                    st.flipErrors.set(emsg, (st.flipErrors.get(emsg) ?? 0) + 1);
                    console.error(`Player [${playerId}] second flip failed at (${row2},${col2}):`, emsg);
                    // record move duration and continue to next attempt
                    const moveDuration = Date.now() - moveStart;
                    st.moveDurationsMs.push(moveDuration);
                    continue; // try again
                }
            } catch (err) {
                console.error('attempt to flip a card failed:', err);
                const emsg = formatError(err);
                st.failedFlips += 1;
                st.flipErrors.set(emsg, (st.flipErrors.get(emsg) ?? 0) + 1);
                const moveDuration = Date.now() - moveStart;
                st.moveDurationsMs.push(moveDuration);
            }
        }

        console.log(`Player [${playerId}] finished`);
    }

    function printSummary(): void {
        // aggregate global totals
        let totalMoves = 0;
        let totalSuccessfulFlips = 0;
        let totalFailedFlips = 0;

        console.log('--- Simulation statistics per player ---');
        for (const [pid, st] of statsByPlayer.entries()) {
            totalMoves += st.moves;
            totalSuccessfulFlips += st.successfulFlips;
            totalFailedFlips += st.failedFlips;

            const countDur = st.moveDurationsMs.length;
            const sumDur = st.moveDurationsMs.reduce((a, b) => a + b, 0);
            const avgDur = countDur === 0 ? 0 : (sumDur / countDur);
            const minDur = countDur === 0 ? 0 : Math.min(...st.moveDurationsMs);
            const maxDur = countDur === 0 ? 0 : Math.max(...st.moveDurationsMs);

            console.log(`Player ${pid}:`);
            console.log(`  moves (attempts): ${st.moves}`);
            console.log(`  moves recorded (durations): ${countDur}`);
            console.log(`  avg move time: ${avgDur.toFixed(2)} ms (min ${minDur} ms, max ${maxDur} ms)`);
            console.log(`  successful flips: ${st.successfulFlips}`);
            console.log(`  failed flips: ${st.failedFlips}`);
            if (st.flipErrors.size > 0) {
                console.log(`  flip errors breakdown:`);
                for (const [emsg, count] of st.flipErrors.entries()) {
                    console.log(`    ${count} × ${emsg}`);
                }
            } else {
                console.log(`  flip errors breakdown: (none)`);
            }
            console.log('');
        }

        console.log('--- Global totals ---');
        console.log(`Total players: ${statsByPlayer.size}`);
        console.log(`Total moves (attempts): ${totalMoves}`);
        console.log(`Total successful flips: ${totalSuccessfulFlips}`);
        console.log(`Total failed flips: ${totalFailedFlips}`);
    }
}



/**
 * Random positive integer generator
 * 
 * @param max a positive integer which is the upper bound of the generated number
 * @returns a random integer >= 0 and < max
 */
function randomInt(max: number): number {
    return Math.floor(Math.random() * max);
}


/**
 * @param milliseconds duration to wait
 * @returns a promise that fulfills no less than `milliseconds` after timeout() was called
 */
async function timeout(milliseconds: number): Promise<void> {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, milliseconds);
    return promise;
}

function formatError(err: any): string {
    if (!err) return String(err);
    if (err instanceof Error) {
        return `${err.name}: ${err.message}`;
    }
    try {
        return String(err);
    } catch {
        return 'UnknownError';
    }
}

void simulationMain();
