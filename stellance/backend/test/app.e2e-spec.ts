import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './../src/app.controller';
import { AppService } from './../src/app.service';

describe('AppController (e2e)', () => {
  let controller: AppController;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    controller = moduleFixture.get(AppController);
  });

  it('/ (GET)', () => {
    expect(controller.getHello()).toBe('Hello World!');
  });
});
