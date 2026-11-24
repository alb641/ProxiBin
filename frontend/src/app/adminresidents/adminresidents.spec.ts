import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Adminresidents } from './adminresidents';

describe('Adminresidents', () => {
  let component: Adminresidents;
  let fixture: ComponentFixture<Adminresidents>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Adminresidents],
    }).compileComponents();

    fixture = TestBed.createComponent(Adminresidents);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
