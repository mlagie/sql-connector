const mockExecute = jest.fn();
const mockEnd = jest.fn();

const mockPool = {
    promise: () => ({
        execute: mockExecute
    }),
    end: mockEnd
};
const mockPgPool = {
    query: jest.fn(),
    end: mockEnd
};

jest.mock('mysql2', () => {
    // Le require est fait à l'intérieur du callback au moment de l'exécution
    const mysql2Actual = jest.requireActual('mysql2');
    
    return {
        createPool: jest.fn(() => mockPool),
        escape: mysql2Actual.escape,
        escapeId: mysql2Actual.escapeId
    };
});

jest.mock('pg', () => ({
    Pool: jest.fn(() => mockPgPool)
}));

module.exports = { mockExecute, mockEnd, mockPool, mockPgPool };