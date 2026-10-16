import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Haulerdashboard } from './haulerdashboard';

describe('Haulerdashboard', () => {
  let component: Haulerdashboard;
  let fixture: ComponentFixture<Haulerdashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Haulerdashboard],
    }).compileComponents();

    fixture = TestBed.createComponent(Haulerdashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
