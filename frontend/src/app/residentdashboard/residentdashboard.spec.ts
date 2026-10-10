import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Residentdashboard } from './residentdashboard';

describe('Residentdashboard', () => {
  let component: Residentdashboard;
  let fixture: ComponentFixture<Residentdashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Residentdashboard],
    }).compileComponents();

    fixture = TestBed.createComponent(Residentdashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
