/* Copyright (c) 2021-25 MIT 6.102/6.031 course staff, all rights reserved.
 * Redistribution of original or derived work requires permission of course staff.
 */

import assert from 'node:assert';
import { Board } from '../src/board.js';

describe('Board - parseFromFile()', function() {
    it('loads valid board with same dimensions', async function() {
        const board = await Board.parseFromFile('boards/perfect.txt');
        assert.strictEqual(board.getHeight(), 3);
        assert.strictEqual(board.getWidth(), 3);
    });

    it('loads valid board with different dimensions', async function() {
        const board = await Board.parseFromFile('boards/diff_dimensions.txt');
        assert.strictEqual(board.getHeight(), 3);
        assert.strictEqual(board.getWidth(), 2);
    });

    it('fails on invalid board dimensions', async function() {
        await assert.rejects(Board.parseFromFile('boards/wrong_dimensions.txt'));
    });

    it('fails on missing cards', async function() {
        await assert.rejects(Board.parseFromFile('boards/missing_cards.txt'));
    });

    it('fails on nonexistent file', async function() {
        await assert.rejects(Board.parseFromFile('nonexistent.txt'));
    });
});


describe('Board - full rules and async validation', function() {

    const cards = [
        ['A', 'B'],
        ['B', 'A']
    ];
    let board: Board;

    beforeEach(function() {
        board = new Board(2, 2, cards);
    });

    // ============================
    // Rule 1: First Card
    // ============================

    it('1-A: flip fails when there is no card', async function() {
        const playerId = 'p1';
        (board as any).grid[0][0] = null;
        await assert.rejects(board.flip(playerId, 0, 0), /No card at specified location/);
    });

    it('1-B: face down card turns face up and is controlled', async function() {
        const playerId = 'p1';
        await board.flip(playerId, 0, 0);
        const card = board.getCell(0, 0)!;
        assert.strictEqual(card.faceUp, true);
        assert.strictEqual(card.controller, playerId);
    });

    it('1-C: face up, uncontrolled card remains face up and is controlled', async function() {
        const playerId = 'p1';
        const card = board.getCell(0, 0)!;
        card.faceUp = true;
        await board.flip(playerId, 0, 0);
        assert.strictEqual(card.faceUp, true);
        assert.strictEqual(card.controller, playerId);
    });

    it('1-D: face up, controlled by another player waits or eventually acquires', async function() {
        const player1 = 'p1';
        const player2 = 'p2';
        const card = board.getCell(0, 0)!;
        await board.flip(player1, 0, 0);

        const flipPromise = board.flip(player2, 0, 0);
        await new Promise(res => setTimeout(res, 10));
        assert.strictEqual(card.controller, player1);
        flipPromise.catch(() => {}); 
    });

    // ============================
    // Rule 2: Second Card
    // ============================

    it('2-A: second card missing fails and relinquishes first card', async function() {
        const playerId = 'p1';
        await board.flip(playerId, 0, 0);
        (board as any).grid[1][1] = null;
        await assert.rejects(board.flip(playerId, 1, 1));
        const first = board.getCell(0, 0)!;
        assert.strictEqual(first.controller, null);
        assert.strictEqual(first.prevControlledBy, playerId);
    });

    it('2-B: second card face up and controlled fails and relinquishes first card', async function() {
        const p1 = 'p1';
        const p2 = 'p2';
        await board.flip(p1, 0, 0);
        await board.flip(p2, 1, 1); 
        await assert.rejects(board.flip(p1, 1, 1));
        const first = board.getCell(0, 0)!;
        assert.strictEqual(first.controller, null);
        assert.strictEqual(first.prevControlledBy, p1);
    });

    it('2-C/D: face down second card turns face up and matches first card (success)', async function() {
        const p1 = 'p1';
        await board.flip(p1, 0, 0); // A
        await board.flip(p1, 1, 1); // A
        const first = board.getCell(0, 0)!;
        const second = board.getCell(1, 1)!;
        assert.strictEqual(first.controller, p1);
        assert.strictEqual(second.controller, p1);
        assert.strictEqual(first.faceUp, true);
        assert.strictEqual(second.faceUp, true);
    });

    it('2-C/E: face down second card that does not match relinquishes control', async function() {
        const p1 = 'p1';
        await board.flip(p1, 0, 0); // A
        await board.flip(p1, 0, 1); // B
        const first = board.getCell(0, 0)!;
        const second = board.getCell(0, 1)!;
        assert.strictEqual(first.controller, null);
        assert.strictEqual(second.controller, null);
        assert.strictEqual(first.prevControlledBy, p1);
        assert.strictEqual(second.prevControlledBy, p1);
    });

    // ============================
    // Rule 3: Finish previous play
    // ============================

    it('3-A: matching previous pair removed and control relinquished', async function() {
        const p1 = 'p1';
        await board.flip(p1, 0, 0); // first A
        await board.flip(p1, 1, 1); // second A
        // Now try new first card -> triggers finishPreviousPlay
        await board.flip(p1, 0, 1); // B
        const removedA1 = board.getCell(0, 0);
        const removedA2 = board.getCell(1, 1);
        assert.strictEqual(removedA1, null);
        assert.strictEqual(removedA2, null);
    });

    it('3-B: non-matching previous pair turned face down if still on board and uncontrolled', async function() {
        const p1 = 'p1';
        await board.flip(p1, 0, 0); // A
        await board.flip(p1, 0, 1); // B
        // Now try new first card -> triggers finishPreviousPlay
        await board.flip(p1, 1, 0); // B
        const first = board.getCell(0, 0)!;
        const second = board.getCell(0, 1)!;
        assert.strictEqual(first.faceUp, false);
        assert.strictEqual(second.faceUp, false);
    });

    // ============================
    // look
    // ============================

    it('all cards start face down and uncontrolled', function() {
        for (let r = 0; r < board.getHeight(); r++) {
            for (let c = 0; c < board.getWidth(); c++) {
                const card = board.getCell(r, c)!;
                assert.strictEqual(card.faceUp, false);
                assert.strictEqual(card.controller, null);
            }
        }
    });

    it('look shows my, up, down, none correctly', async function() {
        const p1 = 'p1';
        await board.flip(p1, 0, 0);
        (board as any).grid[1][1] = null;
        const snapshot = await board.look(p1);
        assert(snapshot.includes('my A'));
        assert(snapshot.includes('down'));
        assert(snapshot.includes('none'));
    });

    // ============================
    // map
    // ============================

    it('map replaces all occurrences of a value and ignores removed cards', async function() {
        const p1 = 'p1';
        await board.flip(p1, 0, 0);
        await board.flip(p1, 1, 1);
        
        const cardToRemove = board.getCell(0, 1)!;
        (board as any).grid[0][1] = null;
        cardToRemove.removed = true;

        await board.map(p1, async val => val.toLowerCase());
        assert.strictEqual(board.getCell(0, 0)?.value, 'a');
        assert.strictEqual(board.getCell(1, 1)?.value, 'a');
        assert.strictEqual(board.getCell(0, 1), null);
    });

    // ============================
    // watch
    // ============================

    it('watch resolves when a card is flipped (player sees "my" or "up")', async function () {
        const watcher = 'watcher';
        const watchPromise = board.watch(watcher);

        await board.flip('p1', 0, 0);
        const snap = await watchPromise;
        // snapshot should reflect the flipped card value (format is implementation-dependent)
        assert(snap.includes('A') || snap.includes('a'));
    });

    it('multiple watchers are all notified on a single change', async function () {
        const w1 = board.watch('w1');
        const w2 = board.watch('w2');
        const w3 = board.watch('w3');

        // cause a change
        await board.flip('actor', 0, 0);

        const [s1, s2, s3] = await Promise.all([w1, w2, w3]);

        assert(s1.includes('A') || s1.includes('a'));
        assert(s2.includes('A') || s2.includes('a'));
        assert(s3.includes('A') || s3.includes('a'));
    });

    it('watch does not resolve when nothing changes (short timeout)', async function () {
        // start a watch but do not change the board
        const watchPromise = board.watch('idle');

        // race it against a short timeout to ensure it does not resolve prematurely
        const shortTimeout = new Promise(resolve => setTimeout(() => resolve('timeout'), 150));
        const result = await Promise.race([watchPromise, shortTimeout]);

        assert.strictEqual(result, 'timeout', 'watch should not resolve when there is no board change');
        // clean up: consume the watcher by performing a change so test environment remains stable
        await board.flip('cleanup', 0, 0);
    });
});

