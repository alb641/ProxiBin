import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Purpose } from './purpose';

describe('Purpose', () => {
  let component: Purpose;
  let fixture: ComponentFixture<Purpose>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Purpose],
    }).compileComponents();

    fixture = TestBed.createComponent(Purpose);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
