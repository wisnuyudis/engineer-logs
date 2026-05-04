import { authenticateToken, AuthRequest } from '../middlewares/authMiddleware';

describe('authenticateToken', () => {
  it('returns 401 when authorization header is missing', () => {
    const req = { headers: {} } as AuthRequest;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as any;
    const next = jest.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Access token missing' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when authorization header is not a bearer token', () => {
    const req = { headers: { authorization: 'Basic abc123' } } as AuthRequest;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as any;
    const next = jest.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Access token missing' });
    expect(next).not.toHaveBeenCalled();
  });
});
