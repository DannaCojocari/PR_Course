/* Copyright (c) 2021-25 MIT 6.102/6.031 course staff, all rights reserved.
 * Redistribution of original or derived work requires permission of course staff.
 */

import assert from 'node:assert';
import fs from 'node:fs';

/**
 * TODO specification
 * Mutable and concurrency safe.
 */

/** Represents a single card on the board */
class Card {
    value: string;
    faceUp: boolean;
    controller: string | null;
    removed: boolean;
    readonly row: number;
    readonly col: number;
    prevControlledBy: string | null;

    constructor(value: string, row: number, col: number) {
        this.value = value;
        this.faceUp = false;
        this.controller = null;
        this.removed = false;
        this.row = row;
        this.col = col;
        this.prevControlledBy = null;
    }
}

class Player {
    readonly id: string;
    firstCard: Card | null = null;
    secondCard: Card | null = null;
    previousFirstCard: Card | null = null;
    previousSecondCard: Card | null = null;
    

    constructor(id: string) { this.id = id; }
}


export class Board {
    private readonly grid: (Card | null)[][];
    private readonly width: number;
    private readonly height: number;
    private readonly players: Map<string, Player> = new Map();
    private listeners: Array<{ playerId: string; resolve: (s: string) => void }> = [];



    // TODO fields

    // Abstraction function:
    //   TODO
    // Representation invariant:
    //   TODO
    // Safety from rep exposure:
    //   TODO


    /**
     * Make a new board by parsing a file.
     * 
     * PS4 instructions: the specification of this method may not be changed.
     * 
     * @param filename path to game board file
     * @returns a new board with the size and cards from the file
     * @throws Error if the file cannot be read or is not a valid game board
     */

    public constructor(height: number, width: number, cards: string[][]) {
        // Input validation
        if (width <= 0 || height <= 0) {
            throw new Error('Board dimensions must be positive');
        }
        if (cards.length !== height || cards.some(row => row.length !== width)) {
            throw new Error('Number of cards must match board dimensions');
        }

        // Initialize fields
        this.height = height;
        this.width = width;
        this.grid = new Array(height);
        for (let r = 0; r < height; r++) {
            this.grid[r] = new Array(width);
            for (let c = 0; c < width; c++) {
                this.grid[r]![c] = new Card(cards[r]![c]!, r, c);
            }
        }

        this.checkRep();
    }

    public getHeight(): number {
        return this.height;
    }

    public getWidth(): number {
        return this.width;
    }

    /**
     * Check that the rep invariant is true
     */
    private checkRep(): void {
        // basic board invariants
        assert(Number.isInteger(this.width) && this.width > 0, 'width must be positive integer');
        assert(Number.isInteger(this.height) && this.height > 0, 'height must be positive integer');
        assert(Array.isArray(this.grid), 'grid must be an array');
        assert(this.grid.length === this.height, `grid.length (${this.grid.length}) must equal height (${this.height})`);

        // collect all Card instances seen in the grid to check uniqueness
        const seenCards = new Set<Card>();

        for (let r = 0; r < this.height; r++) {
            const row = this.grid[r];
            assert(Array.isArray(row), `grid[${r}] must be an array`);
            assert(row.length === this.width, `grid[${r}].length (${row.length}) must equal width (${this.width})`);

            for (let c = 0; c < this.width; c++) {
                const cell = row[c];
                if (cell === null) {
                    // If there's no Card object at this cell, nothing to check here
                    continue;
                }

                // must be a Card instance
                assert(cell instanceof Card, `grid[${r}][${c}] must be a Card instance`);

                // row/col must match physical position
                assert(cell.row === r, `card at grid[${r}][${c}] has inconsistent row (${cell.row} !== ${r})`);
                assert(cell.col === c, `card at grid[${r}][${c}] has inconsistent col (${cell.col} !== ${c})`);

                // card must not be marked removed if it still appears in the grid
                assert(cell.removed === false, `card at grid[${r}][${c}] is present in grid but marked removed`);

                // basic types & content checks
                assert(typeof cell.value === 'string', `card.value at ${r},${c} must be string`);
                // optional: disallow empty string values
                // assert(cell.value.length > 0, `card.value at ${r},${c} must be non-empty`);

                assert(typeof cell.faceUp === 'boolean', `card.faceUp at ${r},${c} must be boolean`);
                assert(cell.controller === null || (typeof cell.controller === 'string' && /^\w+$/.test(cell.controller)),
                    `card.controller at ${r},${c} must be null or valid player id`);
                assert(typeof cell.removed === 'boolean', `card.removed at ${r},${c} must be boolean`);
                assert(cell.prevControlledBy === null || (typeof cell.prevControlledBy === 'string' && /^\w+$/.test(cell.prevControlledBy)),
                    `card.prevControlledBy at ${r},${c} must be null or valid player id`);

                // uniqueness: same Card object must not appear in two cells
                assert(!seenCards.has(cell), `card instance appears in multiple grid cells (first duplicate at ${r},${c})`);
                seenCards.add(cell);
            }
        }

        // Validate players map: keys vs Player.id and fields consistency
        assert(this.players instanceof Map, 'players must be a Map');
        for (const [key, pl] of this.players.entries()) {
            // map key must equal player.id and be a valid id string
            assert(typeof key === 'string', `players Map key must be string (got ${typeof key})`);
            assert(typeof pl === 'object' && pl instanceof Player, `players.get(${key}) must be a Player`);
            assert(pl.id === key, `players Map key (${key}) must equal player.id (${pl.id})`);
            assert(/^\w+$/.test(pl.id), `player id (${pl.id}) must match /^\\w+$/`);

            // Helper to check card references
            const checkCardRef = (cardRef: Card | null, name: string, mustBeOnBoardAndControlledBy?: string | null) => {
                if (cardRef === null) return;
                assert(cardRef instanceof Card, `${name} must be null or Card`);
                // If cardRef is on the board, grid must point to the same object at its stored coords
                const onBoard = this.grid[cardRef.row] && this.grid[cardRef.row]![cardRef.col] === cardRef;
                if (onBoard) {
                    // card on board must not be removed (already checked above) and coordinates must match
                    assert(!cardRef.removed, `${name} references a card that is on the grid but marked removed`);
                    assert(cardRef.row >= 0 && cardRef.row < this.height, `${name} row out of bounds`);
                    assert(cardRef.col >= 0 && cardRef.col < this.width, `${name} col out of bounds`);
                } else {
                    // cardRef not currently in grid: must be a removed card (allowed) or else it's an inconsistent reference
                    assert(cardRef.removed === true, `${name} references a non-grid card that is not marked removed`);
                }

                // If we require the card to be controlled by a given player id, check it
                if (mustBeOnBoardAndControlledBy !== undefined) {
                    if (mustBeOnBoardAndControlledBy === null) {
                        // require the card to be on-board but uncontrolled
                        assert(onBoard, `${name} expected to be on board`);
                        assert(cardRef.controller === null, `${name} expected controller to be null`);
                    } else {
                        assert(onBoard, `${name} expected to be on board`);
                        assert(cardRef.controller === mustBeOnBoardAndControlledBy, `${name} controller must be ${mustBeOnBoardAndControlledBy}`);
                    }
                }
            };

            // If a player has a firstCard it must be on the board and controlled by the player
            checkCardRef(pl.firstCard, `player ${pl.id} firstCard`, pl.firstCard ? pl.id : undefined);
            // secondCard should not be used in current implementation, but if present require it to be on-board & controlled
            checkCardRef(pl.secondCard, `player ${pl.id} secondCard`, pl.secondCard ? pl.id : undefined);

            // previousFirstCard / previousSecondCard may be either:
            //  - a card currently on the board (grid at stored coords === that card) OR
            //  - a removed card (card.removed === true, allowed)
            // They should not be an arbitrary Card object with removed === false but not present in grid.
            checkCardRef(pl.previousFirstCard, `player ${pl.id} previousFirstCard`);
            checkCardRef(pl.previousSecondCard, `player ${pl.id} previousSecondCard`);

            // Additional sanity checks
            if (pl.firstCard !== null && pl.secondCard !== null) {
                // In the current game semantics a player should not hold two "current" cards at once.
                assert(false, `player ${pl.id} has both firstCard and secondCard set (inconsistent state)`);
            }
            if (pl.firstCard !== null) {
                // must be controlled by player
                assert(pl.firstCard.controller === pl.id, `player ${pl.id} firstCard is not controlled by that player`);
            }
            if (pl.secondCard !== null) {
                assert(pl.secondCard.controller === pl.id, `player ${pl.id} secondCard is not controlled by that player`);
            }
        }

        // Validate listeners list
        assert(Array.isArray(this.listeners), 'listeners must be an array');
        for (const [i, entry] of this.listeners.entries()) {
            assert(typeof entry === 'object' && entry !== null, `listeners[${i}] must be an object`);
            assert(typeof entry.playerId === 'string' && /^\w+$/.test(entry.playerId), `listeners[${i}].playerId must be a valid id`);
            assert(typeof entry.resolve === 'function', `listeners[${i}].resolve must be a function`);
        }

        // All checks passed
    }

    public static async parseFromFile(filename: string): Promise<Board> {
        // Read the entire file
        const data = await fs.promises.readFile(filename, 'utf-8');

        // Split and clean lines
        const lines = data.trim().split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);

        if (lines.length < 1) {
            throw new Error("Invalid board file: missing size line");
        }

        if (lines[0] === undefined) {
            throw new Error("Invalid board file: size line is undefined");
        }

        // Parse board size (e.g., "5x5")
        const sizeParts = lines[0].split('x');
        if (sizeParts.length !== 2) {
            throw new Error(`Invalid board size format: ${lines[0]}`);
        }

        if (sizeParts[0] === undefined || sizeParts[1] === undefined) {
            throw new Error(`Invalid board size format: ${lines[0]}`);
        }

        const height = parseInt(sizeParts[0]);
        const width = parseInt(sizeParts[1]);

        if (isNaN(height) || isNaN(width) || height <= 0 || width <= 0) {
            throw new Error(`Invalid board dimensions: ${lines[0]}`);
        }

        // Extract card lines
        const cardLines = lines.slice(1);
        if (cardLines.length !== height * width) {
            throw new Error(`Invalid board: expected ${height * width} cards but found ${cardLines.length}`);
        }

        // Build 2D card array
        const cards: string[][] = [];
        for (let i = 0; i < height; i++) {
            const row = cardLines.slice(i * width, (i + 1) * width);
            cards.push(row);
        }

        // Return new board instance
        return new Board(height, width, cards);
    }

    public async look(playerId: string): Promise<string> {
        console.log(`Board.look called by playerId: ${playerId}`);
        const lines: string[] = [];
        lines.push(`${this.height}x${this.width}`);

        for (let r = 0; r < this.height; r++) {
            for (let c = 0; c < this.width; c++) {
                const card = this.grid[r]![c];

                if (!card || card === null || card.removed) {
                    lines.push('none');
                    continue
                } else if (!card.faceUp) {
                    lines.push('down');
                    continue;
                } else if (card.controller === playerId) {
                    lines.push(`my ${card.value}`);
                } else {
                    lines.push(`up ${card.value}`);
                }
            }
        }

        return lines.map(line => line + '\n').join('');

    }

    getOrCreatePlayer(playerId: string): Player {
        if (!this.players.has(playerId)) {
            this.players.set(playerId, new Player(playerId));
        }
        return this.players.get(playerId)!;
    }

    private notifyChange(): void {
        if (this.listeners.length === 0) return;
        const toNotify = this.listeners.slice();
        // clear before invoking resolves to avoid re-entrancy issues
        this.listeners = [];

        for (const entry of toNotify) {
            // get a fresh board snapshot for that player and resolve the listener with it
            // call look() (which returns Promise<string>) and then resolve
            this.look(entry.playerId)
                .then((snapshot) => {
                    try {
                        entry.resolve(snapshot);
                    } catch (e) {
                        // swallow any synchronous errors from the resolver
                    }
                })
                .catch((err) => {
                    // If look() failed for some reason, resolve with an empty board string
                    // (or you could reject; keeping tolerant here is simpler)
                    try { entry.resolve(`${this.height}x${this.width}\n`); } catch (_) {}
                });
        }
    }


    private finishPreviousPlay(player: Player): void {
        const a = player.previousFirstCard;
        const b = player.previousSecondCard;

        // Nothing to finish
        if (!a && !b) return;

        // 3-A: If they matched, remove them and relinquish control
        if (a && b && a.value === b.value) {
            if (!a.removed && this.grid[a.row]?.[a.col] === a) {
                this.grid[a.row]![a.col] = null;
                a.removed = true;
            }
            if (!b.removed && this.grid[b.row]?.[b.col] === b) {
                this.grid[b.row]![b.col] = null;
                b.removed = true;
            }
            if (a) a.controller = null;
            if (b) b.controller = null;

            // clear previous pair
            player.previousFirstCard = null;
            player.previousSecondCard = null;
            this.notifyChange();
            return;
        }

        // 3-B: non-matching pair -> turn them face down if still on board and not controlled by another player
        for (const card of [a, b]) {
            if (!card || card.removed) continue;
            const onBoard = this.grid[card.row]?.[card.col] === card;
            if (!onBoard) continue;

            // Turn face down only if faceUp and not controlled by someone else
            if (card.faceUp && (card.controller === null || card.controller === player.id) && (card.prevControlledBy === player.id || card.prevControlledBy === null )) {
                // Only flip down if nobody else controls it
                if (card.controller === null) {
                    card.faceUp = false;
                }
            }

            // ensure any lingering control by this player removed
            if (card.controller === player.id) card.controller = null;
        }

        // clear previous pair
        player.previousFirstCard = null;
        player.previousSecondCard = null;
        this.notifyChange();
        return;
    }


    private cardExists(row: number, col: number): boolean {
        const card = this.grid[row]?.[col];

        return !!card && !card.removed;
    }

    public async flip(playerId: string, row: number, column: number): Promise<void> {
        const player = this.getOrCreatePlayer(playerId);

        console.log(`Board.flip called by playerId: ${player.id}`);
        if (row < 0 || row >= this.height || column < 0 || column >= this.width) {
            throw new Error('flip: coordinates out of bounds');
        }

        this.finishPreviousPlay(player);

        if (player.firstCard === null) {
            const card = this.grid[row]![column];

            // Rule 1-A
            if (!card || !this.cardExists(row, column)) {
                throw new Error('No card at specified location');
            } 
            
            // Rule 1-B
            if (!card.faceUp) {    
                card.faceUp = true;
                player.firstCard = card;
                card.controller = playerId;
                this.notifyChange();
            } 
            
            // Rule 1-C
            if (card.faceUp && card.controller === null) { 
                player.firstCard = card;
                card.controller = playerId;
                this.notifyChange();
            }

            // Rule 1-D
            if (card.faceUp && card.controller !== playerId && card.controller !== null) { 
                console.log(`Board.flip: card at (${row},${column}) is face-up and controlled by another player. Player [${playerId}] will wait.`);
                const POLL_MS = 500;
                const start = Date.now();
                const waitTimeoutMs = 10000;
                
                while (true) {
                    if (Date.now() - start >= waitTimeoutMs) {
                        throw new Error('flip failed: timed out waiting for control (1-D)');
                    }

                    // If card removed while waiting => fail
                    if (!this.cardExists(row, column)) {
                        throw new Error('Card no longer on board');
                    }

                    const currentCtrl = this.grid[row]![column]!.controller;
                    if (currentCtrl === null) {
                        // try to claim
                        const targetCard = this.grid[row]![column]!;
                        // if card faceDown now, follow 1-B; if still faceUp and uncontrolled, 1-C
                        if (!targetCard.faceUp) {
                            targetCard.faceUp = true;
                        }

                        targetCard.controller = playerId;
                        player.firstCard = targetCard;
                    }

                    // if controller becomes playerId (rare), we immediately proceed
                    if (currentCtrl === playerId) {
                        player.firstCard = this.grid[row]![column]!;
                    }

                    // wait and retry
                    this.notifyChange();
                    await new Promise<void>(resolve => setTimeout(resolve, POLL_MS));
                }
            }

        } else if (player.secondCard === null) {
            const firstCard = player.firstCard;
            const card = this.grid[row]![column]!;

            // Rule 2-A
            if (!card || !this.cardExists(row, column)) {
                player.previousFirstCard = firstCard;
                player.previousSecondCard = null;
                if (!firstCard.removed && this.grid[firstCard.row]?.[firstCard.col] === firstCard) {
                    // keep it faceUp but relinquish
                    firstCard.controller = null;
                    firstCard.prevControlledBy = playerId;
                    this.notifyChange();
                }
                player.firstCard = null;
                throw new Error('No card at specified location for second card');
            }

            // Rule 2-B
            if (card.faceUp && card.controller !== null) {
                player.previousFirstCard = firstCard;
                player.previousSecondCard = null;
                if (!firstCard.removed && this.grid[firstCard.row]?.[firstCard.col] === firstCard) {
                    // keep it faceUp but relinquish
                    firstCard.controller = null;
                    firstCard.prevControlledBy = playerId;
                    this.notifyChange();
                }
                player.firstCard = null;
                throw new Error('Second card is face-up and controlled ');
            }

            // 2-C: If it is face down, turn it face up.
            if (!card.faceUp) {
                card.faceUp = true;
            }

            this.notifyChange();
            player.previousFirstCard = firstCard;
            player.previousSecondCard = card;

            // Now handle match vs non-match
            if (firstCard.value === card.value) {
                // 2-D Success: player keeps control of both cards (they remain face up for now)
                card.controller = playerId;
                firstCard.controller = playerId;
                // Clear current first/second (play is completed; finish will remove them later)
                player.firstCard = null;
                player.secondCard = null;
                this.notifyChange();
            } else {
                // 2-E Not same: relinquish control of both cards (they remain face up for now)
                if (!firstCard.removed && this.grid[firstCard.row]?.[firstCard.col] === firstCard) {
                    firstCard.controller = null;
                    firstCard.prevControlledBy = playerId;
                }
                if (!card.removed && this.grid[card.row]?.[card.col] === card) {
                    card.controller = null;
                    card.prevControlledBy = playerId;
                }
                // Clear current first/second (we stored them in previous*)
                player.firstCard = null;
                player.secondCard = null;
                this.notifyChange();
                return
            }
        }
    }


    public async map(playerId: string, f: (value: string) => Promise<string>): Promise<string> {
        // validate args
        if (typeof playerId !== 'string' || playerId.length === 0 || !/^\w+$/.test(playerId)) {
            throw new Error('map: invalid playerId');
        }
        if (typeof f !== 'function') throw new Error('map: f must be a function');

        // Snapshot distinct values -> positions
        const valuePositions = new Map<string, Array<{ r: number; c: number }>>();
        for (let r = 0; r < this.height; r++) {
            for (let c = 0; c < this.width; c++) {
            const card = this.grid[r]![c];
            if (!card || card.removed) continue;
            const arr = valuePositions.get(card.value) ?? [];
            arr.push({ r, c });
            valuePositions.set(card.value, arr);
            }
        }

        if (valuePositions.size === 0) return this.look(playerId);

        // For each distinct original value call f once (concurrently)
        const values = Array.from(valuePositions.keys());
        const promises = values.map(v => Promise.resolve().then(() => f(v)));
        const settled = await Promise.allSettled(promises);

        // Apply successful replacements synchronously (mutate value field)
        let firstError: any = null;
        for (let i = 0; i < values.length; i++) {
            const original = values[i];
            const res = settled[i];
            if (res!.status === 'fulfilled') {
            const newVal = res!.value;
            const positions = valuePositions.get(original!)!;
            for (const pos of positions) {
                const card = this.grid[pos.r]?.[pos.c];
                if (!card || card.removed) continue;
                // Only replace if the card still has the original value
                if (card.value === original) {
                card.value = newVal; // <-- direct mutation
                }
            }
            } else {
            if (firstError === null) firstError = res!.reason;
            }
        }

        if (firstError !== null) throw firstError;
        
        this.notifyChange();
        return this.look(playerId);
    }

    public async watch(playerId: string): Promise<string> {
        // validation similar to map/others
        if (typeof playerId !== 'string' || playerId.length === 0 || !/^\w+$/.test(playerId)) {
            throw new Error('watch: invalid playerId');
        }
        return new Promise<string>((resolve) => {
            this.listeners.push({ playerId, resolve });
        });
    }

    
}
